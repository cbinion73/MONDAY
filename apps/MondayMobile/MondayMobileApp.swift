import AppIntents
import MONDAYCore
import SwiftUI
import UIKit

@main
struct MondayMobileApp: App {
    @UIApplicationDelegateAdaptor(MondayMobileDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            MobileMondayView()
        }
    }
}

@MainActor
final class MobileMondayModel: ObservableObject {
    @Published var workspace = MondayWorkspace()
    @Published var capabilities: [CapabilityDescriptor] = []
    @Published var draft = ""
    @Published var isWorking = false
    @Published var errorMessage: String?
    @Published var showTrust = false
    @Published var showConnections = false
    @Published var showKnowledge = false
    @Published var showCommandCenter = false
    @Published var isListening = false
    @Published var sessionStartMessageCount = 0

    let surface: MondaySurface
    let knowledge = MondayKnowledgeModel()
    private let engine: MondayEngine
    private let speechCapture = MobileSpeechCapture()
    private let speechOutput = MobileSpeechOutput()
    private let bridge = MobileBridgeCoordinator()
    private var voiceTransitionInProgress = false

    init() {
        surface = UIDevice.current.userInterfaceIdiom == .pad ? .iPad : .iPhone
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        engine = MondayEngine(
            store: FileContinuityStore(fileURL: base.appendingPathComponent("MONDAY/mobile-workspace-v1.json")),
            specialists: [
                AppleCalendarSpecialist(),
                AppleRemindersSpecialist(),
                EmailCapabilityBoundarySpecialist(),
                AppleIntelligenceSpecialist()
            ]
        )
    }

    func start() async {
        await perform {
            self.workspace = try await self.engine.start(surface: self.surface)
            self.sessionStartMessageCount = self.workspace.messages.count
            self.capabilities = await self.engine.capabilities()
            await self.knowledge.start()
            await MondaySiriBridge.refreshIndex()
            if let siriQuery = UserDefaults.standard.string(forKey: "MONDAY_SIRI_SEARCH_QUERY") {
                UserDefaults.standard.removeObject(forKey: "MONDAY_SIRI_SEARCH_QUERY")
                self.knowledge.query = siriQuery
                self.showKnowledge = true
            }
            try await self.synchronizeConnections()
            try await self.ingestBridgeInbox()
#if DEBUG
            if ProcessInfo.processInfo.environment["MONDAY_OPEN_CONNECTIONS"] == "1" {
                self.showConnections = true
            }
            if ProcessInfo.processInfo.environment["MONDAY_OPEN_KNOWLEDGE"] == "1" {
                self.showKnowledge = true
            }
#endif
#if DEBUG
            await self.runIntelligenceProbeIfRequested()
            await self.runSpeechStressProbeIfRequested()
            await self.runRoutingProbeIfRequested()
            self.runVoiceInventoryProbeIfRequested()
            self.runVoicePreviewIfRequested()
#endif
        }
    }

#if DEBUG
    private func runIntelligenceProbeIfRequested() async {
        guard let prompt = ProcessInfo.processInfo.environment["MONDAY_INTELLIGENCE_PROBE"],
              !prompt.isEmpty else { return }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MONDAY", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let outputName = ProcessInfo.processInfo.environment["MONDAY_INTELLIGENCE_PROBE_OUTPUT"]
            ?? "intelligence-probe.txt"
        let outputURL = base.appendingPathComponent(outputName)
        try? "RUNNING".write(to: outputURL, atomically: true, encoding: .utf8)
        let output: String
        do {
            var probeWorkspace = workspace
            if ProcessInfo.processInfo.environment["MONDAY_INTELLIGENCE_PROBE_WITH_HISTORY"] != "1" {
                probeWorkspace.messages = []
            }
            if ProcessInfo.processInfo.environment["MONDAY_INTELLIGENCE_PROBE_CLOUD"] == "1" {
                probeWorkspace.settings.cloudIntelligenceEnabled = true
                probeWorkspace.settings.localOnly = false
            }
            let specialist = AppleIntelligenceSpecialist()
            let response = try await specialist.respond(
                to: SpecialistRequest(text: prompt, surface: surface, workspace: probeWorkspace)
            )
            output = response.narrative
        } catch {
            output = "ERROR: \(error.localizedDescription)"
        }
        try? output.write(
            to: outputURL,
            atomically: true,
            encoding: .utf8
        )
    }

    private func runSpeechStressProbeIfRequested() async {
        guard ProcessInfo.processInfo.environment["MONDAY_SPEECH_STRESS_PROBE"] == "1" else { return }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MONDAY", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let outputURL = base.appendingPathComponent("speech-stress-probe.txt")
        try? "RUNNING".write(to: outputURL, atomically: true, encoding: .utf8)

        var failures: [String] = []
        for attempt in 1...6 {
            var attemptError: String?
            await speechCapture.start(
                onText: { _ in },
                onFinal: { _ in },
                onStop: {},
                onError: { attemptError = $0 }
            )
            try? await Task.sleep(for: .milliseconds(350))
            await speechCapture.stop()
            if let attemptError {
                failures.append("Attempt \(attempt): \(attemptError)")
            }
            try? await Task.sleep(for: .milliseconds(150))
        }

        let output = failures.isEmpty
            ? "PASS: 6 sequential SpeechTranscriber sessions released cleanly."
            : "FAIL:\n" + failures.joined(separator: "\n")
        try? output.write(to: outputURL, atomically: true, encoding: .utf8)
    }

    private func runRoutingProbeIfRequested() async {
        guard let prompt = ProcessInfo.processInfo.environment["MONDAY_ROUTING_PROBE"],
              !prompt.isEmpty else { return }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MONDAY", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let outputURL = base.appendingPathComponent("routing-probe.txt")
        try? "RUNNING".write(to: outputURL, atomically: true, encoding: .utf8)

        do {
            let probeEngine = MondayEngine(
                store: InMemoryContinuityStore(),
                specialists: [
                    AppleCalendarSpecialist(),
                    AppleRemindersSpecialist(),
                    EmailCapabilityBoundarySpecialist(),
                    AppleIntelligenceSpecialist()
                ]
            )
            _ = try await probeEngine.start(surface: surface)
            let result = try await probeEngine.send(prompt, from: surface)
            let response = result.messages.last(where: { $0.role == .monday })
            let sources = response?.evidence.map(\.source).joined(separator: ", ") ?? "none"
            let output = "SOURCES: \(sources)\n\n\(response?.text ?? "No response")"
            try output.write(to: outputURL, atomically: true, encoding: .utf8)
        } catch {
            try? "ERROR: \(error.localizedDescription)".write(
                to: outputURL,
                atomically: true,
                encoding: .utf8
            )
        }
    }

    private func runVoiceInventoryProbeIfRequested() {
        guard ProcessInfo.processInfo.environment["MONDAY_VOICE_INVENTORY_PROBE"] == "1" else { return }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MONDAY", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try? speechOutput.inventoryDescription().write(
            to: base.appendingPathComponent("voice-inventory.txt"),
            atomically: true,
            encoding: .utf8
        )
    }

    private func runVoicePreviewIfRequested() {
        guard let name = ProcessInfo.processInfo.environment["MONDAY_VOICE_PREVIEW"],
              !name.isEmpty else { return }
        let sample = ProcessInfo.processInfo.environment["MONDAY_VOICE_PREVIEW_TEXT"]
            ?? "Hey Chris. I’m MONDAY. Smart, capable, and just opinionated enough to keep things interesting. What do you think of this voice?"
        _ = speechOutput.preview(sample, voiceNamed: name)
    }
#endif

    func send(_ supplied: String? = nil, speakResponse: Bool = false) async {
        let text = supplied ?? draft
        let existingLoopIDs = Set(workspace.openLoops.map(\.id))
        draft = ""
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        await perform {
            self.workspace = try await self.engine.send(text, from: self.surface)
            self.capabilities = await self.engine.capabilities()
            try await self.synchronizeConnections()
        }
        for loop in workspace.openLoops where !existingLoopIDs.contains(loop.id) {
            await MondaySiriDonations.commitment(loop.title)
        }
        if speakResponse,
           errorMessage == nil,
           let response = workspace.messages.last(where: { $0.role == .monday }) {
            speechOutput.speak(response.text)
        }
    }

    func approve(_ action: ActionProposal) async {
        await perform {
            self.workspace = try await self.engine.approve(actionID: action.id, from: self.surface)
            self.capabilities = await self.engine.capabilities()
            try await self.synchronizeConnections()
        }
    }

    func decline(_ action: ActionProposal) async {
        await perform { self.workspace = try await self.engine.decline(actionID: action.id, from: self.surface) }
    }

    func updateSettings(_ settings: TrustSettings) async {
        await perform {
            self.workspace = try await self.engine.updateSettings(settings, from: self.surface)
            self.capabilities = await self.engine.capabilities()
            try await self.synchronizeConnections()
        }
    }

    func refreshConnections() async {
        await perform {
            self.capabilities = await self.engine.capabilities()
            try await self.synchronizeConnections()
            try await self.ingestBridgeInbox()
        }
    }

    func verifyConnection(_ connectionID: String) async {
        await perform {
            guard var connection = self.workspace.connections.first(where: { $0.id == connectionID }),
                  connection.manifest.transports.contains(.appGroupBridge) else { return }
            _ = try await self.bridge.sendHandshake(to: connectionID)
            connection.statusDetail = "Handshake queued. Open the specialist app, then pull to refresh."
            var connections = self.workspace.connections
            guard let index = connections.firstIndex(where: { $0.id == connectionID }) else { return }
            connections[index] = connection
            self.workspace = try await self.engine.updateConnections(connections, from: self.surface)
        }
    }

    func updateConnectionPolicy(_ connectionID: String, policy: ConnectionPolicy) async {
        await perform {
            var connections = self.workspace.connections
            guard let index = connections.firstIndex(where: { $0.id == connectionID }),
                  connections[index].state == .connected else { return }
            var settings = self.workspace.settings
            if connectionID == "apple.calendar" {
                settings.calendarRead = policy.observe || policy.importData || policy.recommend
                settings.calendarWrite = policy.actWithApproval
            } else if connectionID == "apple.reminders" {
                settings.remindersRead = policy.observe || policy.importData || policy.recommend
                settings.remindersWrite = policy.actWithApproval
            }
            if settings != self.workspace.settings {
                self.workspace = try await self.engine.updateSettings(settings, from: self.surface)
            }
            connections[index].policy = policy
            self.workspace = try await self.engine.updateConnections(connections, from: self.surface)
        }
    }

    func stop() async {
        await perform { self.workspace = try await self.engine.emergencyStop(from: self.surface) }
    }

    func toggleListening() {
        guard !voiceTransitionInProgress else { return }
        voiceTransitionInProgress = true
        Task {
            defer { voiceTransitionInProgress = false }
            if isListening {
                isListening = false
                await speechCapture.stop(submit: true)
                return
            }
            speechOutput.stop()
            isListening = true
            await speechCapture.start(
                onText: { [weak self] text in self?.draft = text },
                onFinal: { [weak self] text in
                    self?.draft = ""
                    Task { await self?.send(text, speakResponse: true) }
                },
                onStop: { [weak self] in self?.isListening = false },
                onError: { [weak self] message in
                    self?.isListening = false
                    self?.errorMessage = message
                }
            )
        }
    }

    private func perform(_ operation: @escaping @MainActor () async throws -> Void) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await operation()
            await MondaySiriBridge.refreshIndex()
        } catch { errorMessage = error.localizedDescription }
    }

    private func synchronizeConnections() async throws {
        let discovered = MobileConnectionCatalog.discover(
            capabilities: capabilities,
            settings: workspace.settings,
            saved: workspace.connections
        )
        guard discovered != workspace.connections else { return }
        workspace = try await engine.updateConnections(discovered, from: surface)
    }

    private func ingestBridgeInbox() async throws {
        let pending: [BridgeEnvelope]
        do {
            pending = try await bridge.pendingResults()
        } catch MobileBridgeError.appGroupUnavailable {
            return
        }
        for envelope in pending {
            guard await bridge.consumeExpectedHandshake(envelope) else {
                try await bridge.acknowledge(envelope)
                continue
            }
            workspace = try await engine.ingestBridgeEnvelope(envelope, from: surface)
            try await bridge.acknowledge(envelope)
        }
    }
}

private struct LegacyMobileMondayView: View {
    @EnvironmentObject private var model: MobileMondayModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        ZStack {
            MondayDesign.background.ignoresSafeArea()
            VStack(spacing: 0) {
                MobileHeader()
                Divider().overlay(MondayDesign.line)
                if horizontalSizeClass == .regular {
                    HStack(spacing: 0) {
                        MobileConversationPane()
                            .frame(maxWidth: .infinity)
                        Divider().overlay(MondayDesign.line)
                        MobileIntelligencePane()
                            .frame(width: 320)
                    }
                } else {
                    MobileConversationPane()
                }
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $model.showTrust) {
            MobileTrustView().environmentObject(model)
        }
        .sheet(isPresented: $model.showConnections) {
            MobileConnectionsView().environmentObject(model)
        }
        .alert("MONDAY hit a boundary", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "Unknown error")
        }
    }
}

private struct MobileHeader: View {
    @EnvironmentObject private var model: MobileMondayModel

    var body: some View {
        HStack(spacing: 10) {
            MondayOrb(size: 30, active: model.isWorking)
            VStack(alignment: .leading, spacing: 1) {
                Text("MONDAY")
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .tracking(1.9)
                Text("ONE PRESENCE · \(model.surface.displayName.uppercased())")
                    .font(.system(size: 8, weight: .bold, design: .rounded))
                    .tracking(1.2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            StatusPill(label: "Local", color: MondayDesign.mint, icon: "lock.fill")
            if let intelligence = model.capabilities.first(where: { $0.id == "apple.foundation-model" }) {
                StatusPill(
                    label: intelligence.health == .available ? "Apple Intelligence" : "AI unavailable",
                    color: intelligence.health == .available ? MondayDesign.violet : MondayDesign.amber,
                    icon: "apple.intelligence"
                )
            }
            Button { model.showTrust = true } label: {
                Image(systemName: "checkmark.shield")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.07), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Trust Center")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }
}

private struct MobileConversationPane: View {
    @EnvironmentObject private var model: MobileMondayModel

    private let prompts = [
        "Explain how MONDAY should coordinate specialist apps",
        "Plan my day and protect a focus hour",
        "What can you infer, and what would require observation?"
    ]

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        HStack {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(model.surface == .iPad ? "Think here.\nContinue everywhere." : "The same thread,\nin your pocket.")
                                    .font(.system(size: model.surface == .iPad ? 34 : 29, weight: .medium, design: .rounded))
                                Text("On-device intelligence. Explicit authority. Verified outcomes.")
                                    .font(.system(size: 11, design: .rounded))
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.bottom, 8)

                        ForEach(model.workspace.messages.suffix(14)) { message in
                            MobileMessageView(message: message)
                                .id(message.id)
                        }

                        ForEach(model.workspace.actions.filter { $0.status == .proposed }) { action in
                            MobileApprovalCard(action: action)
                                .id(action.id)
                        }

                        if model.isWorking {
                            HStack(spacing: 10) {
                                MondayOrb(size: 22)
                                Text("Reasoning on device…")
                                    .font(.system(size: 11, design: .rounded))
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                        }
                    }
                    .frame(maxWidth: 760)
                    .padding(22)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: model.workspace.messages.count) {
                    if let id = model.workspace.messages.last?.id {
                        withAnimation { proxy.scrollTo(id, anchor: .bottom) }
                    }
                }
            }

            VStack(spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(prompts, id: \.self) { prompt in
                            Button(prompt) { Task { await model.send(prompt) } }
                                .buttonStyle(.plain)
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 7)
                                .background(Color.white.opacity(0.05), in: Capsule())
                                .overlay(Capsule().stroke(MondayDesign.line, lineWidth: 0.6))
                        }
                    }
                }

                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Tell MONDAY what you need carried through…", text: $model.draft, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14, design: .rounded))
                        .lineLimit(1...5)
                        .submitLabel(.send)
                        .onSubmit { Task { await model.send() } }
                    Button { model.toggleListening() } label: {
                        Image(systemName: model.isListening ? "waveform.circle.fill" : "mic.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(model.isListening ? MondayDesign.rose : .secondary)
                            .frame(width: 32, height: 32)
                            .background(Color.white.opacity(0.06), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(model.isListening ? "Stop listening" : "Start voice input")
                    Button { Task { await model.send() } } label: {
                        Image(systemName: "arrow.up")
                            .fontWeight(.bold)
                            .frame(width: 32, height: 32)
                            .background(model.draft.isEmpty ? Color.white.opacity(0.08) : MondayDesign.violet, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.draft.isEmpty || model.isWorking)
                }
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 19))
                .overlay(RoundedRectangle(cornerRadius: 19).stroke(MondayDesign.line, lineWidth: 0.7))
            }
            .frame(maxWidth: 760)
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
            .frame(maxWidth: .infinity)
        }
    }
}

struct MobileMessageView: View {
    let message: ConversationMessage
    @State private var showEvidence = false

    var body: some View {
        HStack(alignment: .top) {
            if message.role == .user { Spacer(minLength: 70) }
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 7) {
                Text(message.text)
                    .font(.system(size: 14, design: .rounded))
                    .lineSpacing(3)
                    .textSelection(.enabled)
                    .padding(14)
                    .background(
                        message.role == .user ? MondayDesign.violet.opacity(0.22) : Color.white.opacity(0.06),
                        in: RoundedRectangle(cornerRadius: 17)
                    )
                    .overlay(RoundedRectangle(cornerRadius: 17).stroke(MondayDesign.line, lineWidth: 0.5))
                if !message.evidence.isEmpty {
                    Button { withAnimation { showEvidence.toggle() } } label: {
                        Label(
                            "\(message.evidence.count) source\(message.evidence.count == 1 ? "" : "s") · \(message.evidence[0].kind.rawValue)",
                            systemImage: "checkmark.seal"
                        )
                        .font(.system(size: 9, weight: .medium, design: .rounded))
                        .foregroundStyle(MondayDesign.mint)
                    }
                    .buttonStyle(.plain)
                    if showEvidence {
                        ForEach(message.evidence) { evidence in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(evidence.source).font(.system(size: 9, weight: .semibold))
                                Text(evidence.claim).font(.system(size: 10)).foregroundStyle(.secondary)
                            }
                            .padding(9)
                            .background(.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
                Text("\(message.surface.displayName) · \(message.createdAt.formatted(date: .omitted, time: .shortened))")
                    .font(.system(size: 8, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: 590, alignment: message.role == .user ? .trailing : .leading)
            if message.role != .user { Spacer(minLength: 55) }
        }
    }
}

struct MobileApprovalCard: View {
    @EnvironmentObject private var model: MobileMondayModel
    let action: ActionProposal

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 13) {
                HStack {
                    StatusPill(label: "Approval required", color: MondayDesign.amber, icon: "hand.raised.fill")
                    Spacer()
                    Label(action.reversible ? "Reversible" : "Irreversible", systemImage: "arrow.uturn.backward")
                        .font(.system(size: 9, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Text(action.title).font(.system(size: 18, weight: .semibold, design: .rounded))
                Text(action.explanation).font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary)
                HStack {
                    Button("Approve once") { Task { await model.approve(action) } }
                        .buttonStyle(.borderedProminent)
                        .tint(MondayDesign.violet)
                    Button("Not now") { Task { await model.decline(action) } }
                        .buttonStyle(.bordered)
                    Spacer()
                    Text("No standing authority").font(.system(size: 8)).foregroundStyle(.tertiary)
                }
            }
        }
    }
}

private struct MobileIntelligencePane: View {
    @EnvironmentObject private var model: MobileMondayModel

    private var activeLoops: [OpenLoop] {
        model.workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("INTELLIGENCE")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .tracking(1.5)
                        .foregroundStyle(.secondary)
                    Text("What is actually available")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                }

                ForEach(model.capabilities) { capability in
                    VStack(alignment: .leading, spacing: 7) {
                        HStack {
                            Image(systemName: capabilityIcon(capability))
                                .foregroundStyle(capability.health == .available ? MondayDesign.mint : MondayDesign.amber)
                            Text(capability.name).font(.system(size: 12, weight: .semibold))
                            Spacer()
                            Circle()
                                .fill(capability.health == .available ? MondayDesign.mint : MondayDesign.amber)
                                .frame(width: 7, height: 7)
                        }
                        Text(capability.statusDetail)
                            .font(.system(size: 10, design: .rounded))
                            .foregroundStyle(.secondary)
                        Text(capability.verificationMethod)
                            .font(.system(size: 9, design: .rounded))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(13)
                    .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
                }

                Divider().overlay(MondayDesign.line)

                Text("OPEN LOOPS")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(1.5)
                    .foregroundStyle(.secondary)
                ForEach(activeLoops.prefix(4)) { loop in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(loop.title).font(.system(size: 11, weight: .semibold, design: .rounded))
                        Text(loop.status.rawValue).font(.system(size: 8, weight: .bold)).foregroundStyle(MondayDesign.blue)
                        Text(loop.detail).font(.system(size: 9, design: .rounded)).foregroundStyle(.secondary).lineLimit(3)
                    }
                }

                Divider().overlay(MondayDesign.line)

                VStack(alignment: .leading, spacing: 9) {
                    if model.workspace.settings.cloudIntelligenceEnabled && !model.workspace.settings.localOnly {
                        Label("Apple Private Cloud Compute", systemImage: "icloud.and.arrow.up").foregroundStyle(MondayDesign.violet)
                    } else {
                        Label("Local-only intelligence", systemImage: "iphone.and.arrow.forward").foregroundStyle(MondayDesign.mint)
                    }
                    Label("No action tools for AI", systemImage: "hand.raised").foregroundStyle(MondayDesign.mint)
                    Label("Completion requires proof", systemImage: "checkmark.seal").foregroundStyle(MondayDesign.mint)
                }
                .font(.system(size: 10, design: .rounded))

                if let usage = model.workspace.modelUsage.last {
                    Divider().overlay(MondayDesign.line)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("LATEST MODEL USE")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .tracking(1.5)
                            .foregroundStyle(.secondary)
                        Text(usage.model).font(.system(size: 11, weight: .semibold, design: .rounded))
                        Text("\(usage.route.displayName) · \(usage.invocationCount) invocation\(usage.invocationCount == 1 ? "" : "s")")
                            .font(.system(size: 9, design: .rounded)).foregroundStyle(.secondary)
                        Text(usage.personalContextLeftDevice ? "Authorized context left device for Apple PCC" : "Context stayed on this device")
                            .font(.system(size: 9, design: .rounded))
                            .foregroundStyle(usage.personalContextLeftDevice ? MondayDesign.violet : MondayDesign.mint)
                        Text(usage.reportedCostUSD.map { "Reported cost: $\(String(format: "%.4f", $0))" } ?? "No cost was reported by the framework")
                            .font(.system(size: 9, design: .rounded)).foregroundStyle(.tertiary)
                    }
                }
            }
            .padding(20)
        }
        .background(.black.opacity(0.11))
    }

    private func capabilityIcon(_ capability: CapabilityDescriptor) -> String {
        if capability.id.contains("foundation") { return "apple.intelligence" }
        if capability.id.contains("reminders") { return "checklist" }
        return "calendar"
    }
}

struct MobileTrustView: View {
    @EnvironmentObject private var model: MobileMondayModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft = TrustSettings()

    var body: some View {
        NavigationStack {
            Form {
                Section("Connections") {
                    Button {
                        dismiss()
                        model.showConnections = true
                    } label: {
                        Label("Manage specialist apps and data access", systemImage: "point.3.connected.trianglepath.dotted")
                    }
                    LabeledContent("Live", value: "\(model.workspace.connections.filter { $0.state == .connected }.count)")
                    LabeledContent("Waiting for adapters", value: "\(model.workspace.connections.filter { $0.state == .adapterRequired }.count)")
                }
                Section("Intelligence") {
                    Toggle("Apple Intelligence", isOn: $draft.onDeviceIntelligenceEnabled)
                    Toggle("Local-only mode", isOn: Binding(
                        get: { draft.localOnly },
                        set: { enabled in
                            draft.localOnly = enabled
                            if enabled { draft.cloudIntelligenceEnabled = false }
                        }
                    ))
                    Toggle("Apple Private Cloud Compute", isOn: Binding(
                        get: { draft.cloudIntelligenceEnabled && !draft.localOnly },
                        set: { enabled in
                            draft.cloudIntelligenceEnabled = enabled
                            if enabled { draft.localOnly = false }
                        }
                    ))
                    Toggle("Background intelligence", isOn: $draft.backgroundIntelligenceEnabled)
                }
                Section("External intelligence") {
                    LabeledContent("Approval", value: draft.externalModelPolicy.approvalMode == .everyRequest ? "Every call" : "Restricted")
                    LabeledContent("Automatic budget", value: String(format: "$%.2f / month", Double(draft.externalModelPolicy.automaticMonthlyBudgetCents) / 100))
                    LabeledContent("Automatic request classes", value: draft.externalModelPolicy.automaticRequestClasses.isEmpty ? "None" : "\(draft.externalModelPolicy.automaticRequestClasses.count)")
                    LabeledContent("Pro / max modes", value: draft.externalModelPolicy.proAndMaxModesEnabled ? "On" : "Off")
                    Text("OpenAI is an external fallback. Before any call, MONDAY must show the model, purpose, disclosed context, token ceilings, and maximum estimated cost. Approval is bound to that exact request and works once.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Monday Knowledge") {
                    LabeledContent("Format", value: "Markdown + JSON")
                    LabeledContent("Sync", value: "Apple iCloud Documents")
                    LabeledContent("Vault context", value: "Reviewed selections only")
                    LabeledContent("Canonical source", value: "Obsidian on Mac")
                    Text("Your knowledge library remains machine-readable. MONDAY does not send note contents to an external model without a separately disclosed, one-time approval.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Vault-derived notes are read-only on this device, retain their source link and revision hash, and disappear when revoked on Mac.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Siri AI") {
                    Toggle("Allow Siri AI to use MONDAY", isOn: $draft.siriIntelligenceEnabled)
                    Toggle("Publish Monday Knowledge to Spotlight", isOn: $draft.siriKnowledgeIndexingEnabled)
                        .disabled(!draft.siriIntelligenceEnabled)
                    LabeledContent("Role", value: "MONDAY intelligence provider")
                    LabeledContent("Published context", value: "Authorized Spotlight entities")
                    LabeledContent("Background actions", value: "Read and capture only")
                    LabeledContent("Consequential work", value: "Proposal only")
                    Text("Siri may recognize MONDAY-shaped requests from their meaning. It can search context, capture knowledge, record commitments, review priorities, and assess capacity. It cannot bypass MONDAY approvals or execute consequential work.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Voice") {
                    LabeledContent("Transcription", value: "Apple SpeechTranscriber")
                    LabeledContent("Processing", value: "On device")
                    Text("On iPadOS 27, MONDAY uses Apple’s newest speech model and does not depend on Siri or keyboard dictation being enabled.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Awareness and authority") {
                    Toggle("Permissioned awareness", isOn: $draft.awarenessEnabled)
                    Toggle("Action authority", isOn: $draft.actionsEnabled)
                    Toggle("Observe Apple Calendar", isOn: $draft.calendarRead)
                    Toggle("Create approved Calendar events", isOn: $draft.calendarWrite)
                }
                Section("Apple Reminders") {
                    Toggle("Observe reminders", isOn: $draft.remindersRead)
                    Toggle("Create approved reminders", isOn: $draft.remindersWrite)
                }
                Section("Recent model use") {
                    if model.workspace.modelUsage.isEmpty {
                        Text("No model use recorded yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(model.workspace.modelUsage.suffix(5).reversed())) { usage in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(usage.model).font(.headline)
                                Text("\(usage.route.displayName) · \(usage.surface.displayName) · \(usage.timestamp.formatted(date: .abbreviated, time: .shortened))")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(usage.personalContextLeftDevice ? "Apple PCC boundary · no framework cost reported" : "Stayed on device · $0 reported cost")
                                    .font(.caption2)
                                    .foregroundStyle(usage.personalContextLeftDevice ? MondayDesign.violet : MondayDesign.mint)
                            }
                        }
                    }
                }
                Section("Recent actions") {
                    if model.workspace.actions.isEmpty {
                        Text("No actions proposed or executed yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(model.workspace.actions.suffix(5).reversed())) { action in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(action.title).font(.headline)
                                Text("\(action.status.rawValue) · \(action.capabilityID)")
                                    .font(.caption).foregroundStyle(.secondary)
                                if let verification = action.verification {
                                    Text(verification).font(.caption2)
                                }
                            }
                        }
                    }
                }
                Section {
                    Button("STOP EVERYTHING", role: .destructive) {
                        Task {
                            await model.stop()
                            draft = model.workspace.settings
                        }
                    }
                } footer: {
                    Text("Private Cloud Compute sends conversational context to Apple’s privacy-preserving cloud only when enabled. Intelligence has no action tools; consequential actions still require a specific preview and approval.")
                }
            }
            .navigationTitle("Trust Center")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await model.updateSettings(draft)
                            dismiss()
                        }
                    }
                }
            }
        }
        .onAppear { draft = model.workspace.settings }
    }
}
