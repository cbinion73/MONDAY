import AppKit
import AVFoundation
import Foundation
import MONDAYCore

@MainActor
final class MondayAppModel: ObservableObject {
    @Published var workspace = MondayWorkspace()
    @Published var capabilities: [CapabilityDescriptor] = []
    @Published var draft = ""
    @Published var isWorking = false
    @Published var errorMessage: String?
    @Published var selectedSurface: MondaySurface = .mac
    @Published var showTrust = false
    @Published var showActivity = false
    @Published var showKnowledge = false
    @Published var showCommandCenter = false
    @Published var showPlanner = false
    @Published var showObsidianPromotion = false
    @Published var composerFocused = false
    @Published var messagesContactHandle = ""
    @Published var messagesBridgeStatus = "Messages is not configured."

    private let engine: MondayEngine
    private let messagesBridge = MondayMessagesBridge()
    let knowledge = MondayKnowledgeModel()
    private let speaker = AVSpeechSynthesizer()

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MONDAY", isDirectory: true)
        let store = FileContinuityStore(fileURL: base.appendingPathComponent("workspace-v1.json"))
        self.engine = MondayEngine(
            store: store,
            specialists: [
                AppleCalendarSpecialist(),
                AppleRemindersSpecialist(),
                EmailCapabilityBoundarySpecialist(),
                MacApplicationSpecialist(),
                AppleIntelligenceSpecialist(
                    vaultRootURL: FileManager.default.homeDirectoryForCurrentUser
                        .appendingPathComponent("Knowledge Vault/Personal Knowledge Vault", isDirectory: true)
                )
            ]
        )
    }

    func start() async {
        await perform {
            self.workspace = try await self.engine.start(surface: .mac)
            self.capabilities = await self.engine.capabilities()
            self.messagesBridge.connect(to: self)
            self.messagesContactHandle = self.messagesBridge.contactHandle
            self.messagesBridgeStatus = await self.messagesBridge.reconcile(settings: self.workspace.settings)
            await self.knowledge.start()
            await MondaySiriBridge.refreshIndex()
            if let siriQuery = UserDefaults.standard.string(forKey: "MONDAY_SIRI_SEARCH_QUERY") {
                UserDefaults.standard.removeObject(forKey: "MONDAY_SIRI_SEARCH_QUERY")
                self.knowledge.query = siriQuery
                self.showKnowledge = true
            }
        }
    }

    func send(_ suppliedText: String? = nil) async {
        let text = (suppliedText ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let existingLoopIDs = Set(workspace.openLoops.map(\.id))
        draft = ""
        await perform {
            self.workspace = try await self.engine.send(text, from: self.selectedSurface)
            self.capabilities = await self.engine.capabilities()
        }
        for loop in workspace.openLoops where !existingLoopIDs.contains(loop.id) {
            await MondaySiriDonations.commitment(loop.title)
        }
    }

    func approve(_ action: ActionProposal) async {
        await perform {
            self.workspace = try await self.engine.approve(actionID: action.id, from: self.selectedSurface)
            self.capabilities = await self.engine.capabilities()
        }
    }

    func decline(_ action: ActionProposal) async {
        await perform {
            self.workspace = try await self.engine.decline(actionID: action.id, from: self.selectedSurface)
        }
    }

    func updateSettings(_ settings: TrustSettings) async {
        await perform {
            self.workspace = try await self.engine.updateSettings(settings, from: .mac)
            self.capabilities = await self.engine.capabilities()
            self.messagesBridgeStatus = await self.messagesBridge.reconcile(settings: self.workspace.settings)
        }
    }

    func configureMessagesContact() async {
        messagesBridge.configure(contactHandle: messagesContactHandle)
        messagesContactHandle = messagesBridge.contactHandle
        messagesBridgeStatus = await messagesBridge.reconcile(settings: workspace.settings)
    }

    func receiveFromMessages(_ text: String) async -> String? {
        await perform {
            self.workspace = try await self.engine.send(text, from: .messages)
            self.capabilities = await self.engine.capabilities()
        }
        guard errorMessage == nil else { return "I received your message, but the local MONDAY workspace could not process it: \(errorMessage ?? "Unknown error")" }
        let proposed = workspace.actions.last(where: { $0.status == .proposed && $0.proposedAt > .now.addingTimeInterval(-10) })
        let response = workspace.messages.last(where: { $0.role == .monday })?.text
        if let proposed {
            return "\(response ?? "I prepared an action.")\n\nTo authorize this one action, reply APPROVE \(proposed.id.uuidString.prefix(8).uppercased()). To decline it, reply DECLINE \(proposed.id.uuidString.prefix(8).uppercased())."
        }
        return response
    }

    func approveFromMessages(token: String) async -> String {
        guard let action = matchingProposedAction(token: token) else {
            return "I could not find one pending action matching that code. Nothing changed."
        }
        await approve(action)
        return workspace.messages.last(where: { $0.role == .monday })?.text ?? "The approval was recorded, but I could not produce a verified result."
    }

    func declineFromMessages(token: String) async -> String {
        guard let action = matchingProposedAction(token: token) else {
            return "I could not find one pending action matching that code. Nothing changed."
        }
        await decline(action)
        return "Declined \(action.title). Nothing changed."
    }

    func sendMessagesAttention(_ text: String) async {
        do {
            try messagesBridge.sendAttention(text)
            messagesBridgeStatus = "Sent attention update to \(messagesBridge.contactHandle)."
        } catch {
            messagesBridgeStatus = error.localizedDescription
        }
    }

    func stopEverything() async {
        await perform {
            self.workspace = try await self.engine.emergencyStop(from: .mac)
        }
    }

    func speakLastResponse() {
        guard let last = workspace.messages.last(where: { $0.role == .monday }) else { return }
        if speaker.isSpeaking { speaker.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: last.text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        speaker.speak(utterance)
    }

    private func matchingProposedAction(token: String) -> ActionProposal? {
        let normalized = token.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard normalized.count >= 8 else { return nil }
        return workspace.actions.first {
            $0.status == .proposed && $0.id.uuidString.uppercased().hasPrefix(normalized)
        }
    }

    private func perform(_ operation: @escaping @MainActor () async throws -> Void) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await operation()
            await MondaySiriBridge.refreshIndex()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
