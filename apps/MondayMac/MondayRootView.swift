import MONDAYCore
import SwiftUI

struct MondayRootView: View {
    @EnvironmentObject private var model: MondayAppModel

    var body: some View {
        ZStack {
            MondayDesign.background.ignoresSafeArea()
            Circle()
                .fill(MondayDesign.violet.opacity(0.10))
                .frame(width: 620, height: 620)
                .blur(radius: 90)
                .offset(x: -430, y: -330)

            HStack(spacing: 0) {
                MondayRail()
                    .frame(width: 232)

                Rectangle().fill(MondayDesign.line).frame(width: 1)

                ConversationView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                Rectangle().fill(MondayDesign.line).frame(width: 1)

                ContextThreadView()
                    .frame(width: 310)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $model.showTrust) {
            MondayTrustView().environmentObject(model).frame(width: 620, height: 650)
        }
        .sheet(isPresented: $model.showActivity) {
            MondayActivityView().environmentObject(model).frame(width: 720, height: 640)
        }
        .sheet(isPresented: $model.showKnowledge) {
            MondayKnowledgeView(library: model.knowledge).frame(minWidth: 1040, minHeight: 720)
        }
        .sheet(isPresented: $model.showCommandCenter) {
            CommandCenterView()
                .frame(minWidth: 1180, minHeight: 780)
        }
        .sheet(isPresented: $model.showPlanner) {
            MondayMacPlannerView()
                .frame(minWidth: 980, minHeight: 720)
        }
        .sheet(isPresented: $model.showObsidianPromotion) {
            ObsidianPromotionView(library: model.knowledge)
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

private struct MondayRail: View {
    @EnvironmentObject private var model: MondayAppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 11) {
                MondayOrb(size: 30, active: model.isWorking)
                VStack(alignment: .leading, spacing: 1) {
                    Text("MONDAY")
                        .font(.system(size: 17, weight: .heavy, design: .rounded))
                        .tracking(1.9)
                    Text("ONE PRESENCE")
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .tracking(1.6)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.bottom, 34)

            Text("CONTINUE ON")
                .font(.system(size: 9, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.bottom, 10)

            ForEach(MondaySurface.allCases) { surface in
                Button {
                    model.selectedSurface = surface
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: icon(for: surface))
                            .frame(width: 20)
                        Text(surface.displayName)
                        Spacer()
                        if model.selectedSurface == surface {
                            Circle().fill(MondayDesign.mint).frame(width: 6, height: 6)
                        }
                    }
                    .font(.system(size: 13, weight: model.selectedSurface == surface ? .semibold : .regular))
                    .foregroundStyle(model.selectedSurface == surface ? .white : .secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(model.selectedSurface == surface ? Color.white.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }

            Spacer()

            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 6) {
                    StatusPill(label: "Local", color: MondayDesign.mint, icon: "lock.fill")
                    if model.workspace.settings.actionsEnabled {
                        StatusPill(label: "Ready", color: MondayDesign.blue)
                    } else {
                        StatusPill(label: "Stopped", color: MondayDesign.rose)
                    }
                }
                Text("No cloud intelligence\nNo background model spend")
                    .font(.system(size: 10, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
            }
            .padding(12)
            .background(.black.opacity(0.16), in: RoundedRectangle(cornerRadius: 13))

            Button { model.showTrust = true } label: {
                Label("Trust Center", systemImage: "checkmark.shield")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Button { model.showKnowledge = true } label: {
                Label("Monday Knowledge", systemImage: "books.vertical.fill")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Button { model.showCommandCenter = true } label: {
                Label("Command Center", systemImage: "rectangle.3.group.fill")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Button { model.showPlanner = true } label: {
                Label("Daily Planner", systemImage: "calendar")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Button { model.showObsidianPromotion = true } label: {
                Label("Publish Vault Context", systemImage: "rectangle.stack.badge.plus")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)

            Button { model.showActivity = true } label: {
                Label("Activity & proof", systemImage: "checkmark.seal")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 18)
        .padding(.top, 24)
        .padding(.bottom, 18)
        .background(.black.opacity(0.14))
    }

    private func icon(for surface: MondaySurface) -> String {
        switch surface {
        case .mac: "macbook"
        case .messages: "message.fill"
        case .iPhone: "iphone"
        case .iPad: "ipad"
        case .watch: "applewatch"
        case .carPlay: "car.side"
        }
    }
}

private struct ConversationView: View {
    @EnvironmentObject private var model: MondayAppModel
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(greeting)
                        .font(.system(size: 28, weight: .medium, design: .rounded))
                    Text("Same thread · now speaking from \(model.selectedSurface.displayName)")
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button { model.speakLastResponse() } label: {
                    Label("Speak", systemImage: "waveform")
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(.horizontal, 34)
            .padding(.top, 28)
            .padding(.bottom, 18)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 18) {
                        ForEach(model.workspace.messages) { message in
                            MessageView(message: message)
                                .id(message.id)
                        }

                        ForEach(model.workspace.actions.filter { $0.status == .proposed }) { action in
                            ApprovalCard(action: action)
                                .id(action.id)
                        }

                        if model.isWorking {
                            HStack(spacing: 12) {
                                MondayOrb(size: 22)
                                Text("Checking the capability and preserving the proof…")
                                    .font(.system(size: 12, design: .rounded))
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal, 6)
                        }
                    }
                    .padding(.horizontal, 34)
                    .padding(.vertical, 12)
                }
                .onChange(of: model.workspace.messages.count) {
                    if let id = model.workspace.messages.last?.id {
                        withAnimation { proxy.scrollTo(id, anchor: .bottom) }
                    }
                }
            }

            ComposerView(focused: $composerFocused)
                .padding(.horizontal, 34)
                .padding(.top, 12)
                .padding(.bottom, 24)
        }
        .onChange(of: model.composerFocused) { composerFocused = true }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        if hour < 12 { return "Good morning, Chris." }
        if hour < 17 { return "Good afternoon, Chris." }
        return "Good evening, Chris."
    }
}

private struct MessageView: View {
    let message: ConversationMessage
    @State private var showEvidence = false

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            if message.role == .user { Spacer(minLength: 90) }
            if message.role == .monday {
                MondayOrb(size: 27, active: false)
                    .padding(.top, 3)
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 9) {
                Text(message.text)
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .lineSpacing(4)
                    .textSelection(.enabled)
                    .padding(.horizontal, 17)
                    .padding(.vertical, 13)
                    .background(bubbleColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(MondayDesign.line, lineWidth: 0.6))

                if !message.evidence.isEmpty {
                    Button { withAnimation { showEvidence.toggle() } } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.seal")
                            Text("\(message.evidence.count) source\(message.evidence.count == 1 ? "" : "s") · \(message.evidence[0].kind.rawValue)")
                            Image(systemName: showEvidence ? "chevron.up" : "chevron.down")
                        }
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundStyle(MondayDesign.mint)
                    }
                    .buttonStyle(.plain)

                    if showEvidence {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(message.evidence) { evidence in
                                HStack(alignment: .top, spacing: 8) {
                                    Circle().fill(color(for: evidence.kind)).frame(width: 6, height: 6).padding(.top, 5)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(evidence.source).font(.system(size: 10, weight: .semibold))
                                        Text(evidence.claim).font(.system(size: 11)).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .padding(12)
                        .background(.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
                    }
                }

                Text("\(message.surface.displayName) · \(message.createdAt.formatted(date: .omitted, time: .shortened))")
                    .font(.system(size: 9, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: 650, alignment: message.role == .user ? .trailing : .leading)

            if message.role != .user { Spacer(minLength: 60) }
        }
    }

    private var bubbleColor: Color {
        switch message.role {
        case .user: MondayDesign.violet.opacity(0.20)
        case .monday: Color.white.opacity(0.055)
        case .system: MondayDesign.amber.opacity(0.10)
        }
    }

    private func color(for kind: ProvenanceKind) -> Color {
        switch kind {
        case .verified: MondayDesign.mint
        case .attempted: MondayDesign.amber
        case .inferred, .recommended: MondayDesign.violet
        default: MondayDesign.blue
        }
    }
}

private struct ApprovalCard: View {
    @EnvironmentObject private var model: MondayAppModel
    let action: ActionProposal

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    StatusPill(label: "Approval required", color: MondayDesign.amber, icon: "hand.raised.fill")
                    Spacer()
                    Label(action.reversible ? "Reversible" : "Not reversible", systemImage: action.reversible ? "arrow.uturn.backward" : "exclamationmark.triangle")
                        .font(.system(size: 10, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Text(action.title)
                    .font(.system(size: 19, weight: .semibold, design: .rounded))
                Text(action.explanation)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineSpacing(3)
                HStack(spacing: 10) {
                    Button("Approve once") { Task { await model.approve(action) } }
                        .buttonStyle(.borderedProminent)
                        .tint(MondayDesign.violet)
                        .controlSize(.large)
                    Button("Not now") { Task { await model.decline(action) } }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    Spacer()
                    Text("No standing authority granted")
                        .font(.system(size: 9, design: .rounded))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2).fill(MondayDesign.amber).frame(width: 3).padding(.vertical, 15)
        }
    }
}

private struct ComposerView: View {
    @EnvironmentObject private var model: MondayAppModel
    @FocusState.Binding var focused: Bool

    private let prompts = [
        "Plan my day and protect a focus hour",
        "What needs my attention?",
        "I’m leaving—continue this in CarPlay"
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(prompts, id: \.self) { prompt in
                        Button(prompt) { Task { await model.send(prompt) } }
                            .buttonStyle(.plain)
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(Color.white.opacity(0.045), in: Capsule())
                            .overlay(Capsule().stroke(MondayDesign.line, lineWidth: 0.6))
                    }
                }
            }

            HStack(alignment: .bottom, spacing: 12) {
                TextField("Tell MONDAY what you need carried through…", text: $model.draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, design: .rounded))
                    .lineLimit(1...5)
                    .focused($focused)
                    .onSubmit { Task { await model.send() } }
                Button { Task { await model.send() } } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 13, weight: .bold))
                        .frame(width: 30, height: 30)
                        .background(model.draft.isEmpty ? Color.white.opacity(0.08) : MondayDesign.violet, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(model.draft.isEmpty || model.isWorking)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 19).stroke(MondayDesign.line, lineWidth: 0.8))
            .shadow(color: .black.opacity(0.28), radius: 22, y: 10)
        }
    }
}

private struct ContextThreadView: View {
    @EnvironmentObject private var model: MondayAppModel

    private var activeLoops: [OpenLoop] {
        model.workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("THE THREAD")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .tracking(1.5)
                        .foregroundStyle(.secondary)
                    Text("What MONDAY is holding")
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                }

                if activeLoops.isEmpty {
                    GlassCard {
                        Label("No unresolved loops", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 12, design: .rounded))
                            .foregroundStyle(MondayDesign.mint)
                    }
                } else {
                    ForEach(activeLoops.prefix(4)) { loop in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Circle().fill(loopColor(loop.status)).frame(width: 7, height: 7)
                                Text(loop.status.rawValue.replacingOccurrences(of: "awaitingApproval", with: "awaiting approval").uppercased())
                                    .font(.system(size: 8, weight: .bold, design: .rounded))
                                    .tracking(0.8)
                                    .foregroundStyle(.secondary)
                            }
                            Text(loop.title)
                                .font(.system(size: 13, weight: .semibold, design: .rounded))
                            Text(loop.detail)
                                .font(.system(size: 11, design: .rounded))
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                        }
                        .padding(13)
                        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
                    }
                }

                Divider().overlay(MondayDesign.line)

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("CAPABILITIES")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .tracking(1.4)
                        Spacer()
                        Text("\(model.capabilities.filter { $0.health == .available }.count)/\(model.capabilities.count) ready")
                            .font(.system(size: 9, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    ForEach(model.capabilities) { capability in
                        CapabilityRow(capability: capability)
                    }
                }

                Divider().overlay(MondayDesign.line)

                VStack(alignment: .leading, spacing: 10) {
                    Text("TRUST LENS")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .tracking(1.4)
                    TrustFact(icon: "eye", title: "Observed", value: "Authorized sources only")
                    TrustFact(icon: "brain", title: "Inferred", value: "Always labeled")
                    TrustFact(icon: "hand.raised", title: "Authority", value: "Approve each action")
                    TrustFact(icon: "checkmark.seal", title: "Completion", value: "Read-back verified")
                }
            }
            .padding(22)
        }
        .background(.black.opacity(0.10))
    }

    private func loopColor(_ status: OpenLoopStatus) -> Color {
        switch status {
        case .awaitingApproval: MondayDesign.amber
        case .blocked: MondayDesign.rose
        case .scheduled: MondayDesign.blue
        default: MondayDesign.violet
        }
    }
}

private struct CapabilityRow: View {
    let capability: CapabilityDescriptor

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: capabilityIcon)
                .foregroundStyle(MondayDesign.blue)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(capability.name).font(.system(size: 11, weight: .semibold))
                Text(capability.statusDetail).font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            Circle().fill(healthColor).frame(width: 7, height: 7)
        }
    }

    private var healthColor: Color {
        switch capability.health {
        case .available: MondayDesign.mint
        case .needsPermission, .degraded: MondayDesign.amber
        case .unavailable: MondayDesign.rose
        }
    }

    private var capabilityIcon: String {
        if capability.id.contains("calendar") { return "calendar" }
        if capability.id.contains("foundation-model") { return "apple.intelligence" }
        return "app.badge"
    }
}

private struct TrustFact: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(MondayDesign.mint).frame(width: 17)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 10, weight: .semibold))
                Text(value).font(.system(size: 9)).foregroundStyle(.secondary)
            }
        }
    }
}
