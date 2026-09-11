import Foundation
import Testing
@testable import MONDAYCore

private actor TestSpecialist: MondaySpecialist {
    let descriptor = CapabilityDescriptor(
        id: "test.calendar",
        name: "Test Calendar",
        owner: "Calendar",
        summary: "Test-only calendar contract",
        appleTechnology: "EventKit",
        health: .available,
        statusDetail: "Ready",
        supportedSurfaces: [.mac, .iPhone],
        actions: ["create focus block"],
        verificationMethod: "Read after write"
    )
    private(set) var executions = 0

    func canHandle(_ request: SpecialistRequest) -> Bool {
        request.text.localizedCaseInsensitiveContains("focus")
    }

    func respond(to request: SpecialistRequest) -> SpecialistResponse {
        SpecialistResponse(
            narrative: "I found a free hour and prepared a focus block. Nothing has changed yet.",
            evidence: [Evidence(kind: .observed, source: "Test Calendar", claim: "10:00–11:00 is free", confidence: .verified)],
            proposal: ActionProposal(
                capabilityID: descriptor.id,
                title: "Protect one hour for focus",
                explanation: "Creates a reversible calendar event.",
                consequence: .consequential,
                parameters: ["title": "Focus", "start": "2026-07-13T10:00:00Z", "end": "2026-07-13T11:00:00Z"],
                reversible: true
            )
        )
    }

    func execute(_ proposal: ActionProposal) -> ExecutionResult {
        executions += 1
        return ExecutionResult(
            succeeded: true,
            attempted: "Saved event",
            verification: "Read the saved event back by identifier.",
            evidence: [Evidence(kind: .verified, source: "Test Calendar", claim: "Event exists", confidence: .verified)]
        )
    }

    func executionCount() -> Int { executions }
}

private actor TestIntelligenceSpecialist: MondaySpecialist {
    let descriptor = CapabilityDescriptor(
        id: "test.intelligence",
        name: "Test Intelligence",
        owner: "Test",
        summary: "Records a governed model invocation",
        appleTechnology: "Test double",
        health: .available,
        statusDetail: "Ready",
        supportedSurfaces: [.iPad],
        actions: ["answer"],
        verificationMethod: "Usage record"
    )

    func canHandle(_ request: SpecialistRequest) -> Bool { true }

    func respond(to request: SpecialistRequest) -> SpecialistResponse {
        SpecialistResponse(
            narrative: "A test answer.",
            modelUsage: ModelUsageRecord(
                provider: "Apple",
                model: "Test System Model",
                route: .onDevice,
                purpose: "Foreground conversation",
                surface: request.surface,
                inputCharacters: request.text.count,
                outputCharacters: 14,
                personalContextLeftDevice: false,
                reportedCostUSD: 0
            )
        )
    }

    func execute(_ proposal: ActionProposal) throws -> ExecutionResult {
        throw SpecialistError.invalidProposal("No actions")
    }
}

@Suite("MONDAY orchestration and trust")
struct MondayEngineTests {
    @Test("Siri can discover and capture but cannot bypass MONDAY action authority")
    func siriAuthorityBoundary() {
        let policy = MondaySiriRoutingPolicy()
        #expect(policy.authority(for: .discoverContext) == .readOnly)
        #expect(policy.authority(for: .captureKnowledge) == .directCapture)
        #expect(policy.authority(for: .proposeAction) == .proposalOnly)
        #expect(policy.authority(for: .executeAction) == .prohibited)
        #expect(!policy.permitsBackgroundExecution(of: .executeAction))
    }

    @Test("Capacity assessment becomes more conservative as commitments accumulate")
    func capacityPolicy() {
        let quiet = MondayCapacityPolicy.assess(initiative: "a new book", workspace: MondayWorkspace())
        var busyWorkspace = MondayWorkspace()
        busyWorkspace.openLoops = (1...7).map {
            OpenLoop(title: "Commitment \($0)", detail: "Active", originatingSurface: .iPhone)
        }
        let busy = MondayCapacityPolicy.assess(initiative: "a new book", workspace: busyWorkspace)
        #expect(quiet.pressure < busy.pressure)
        #expect(quiet.headline == "There is room")
        #expect(busy.headline == "Not yet")
    }

    @Test("Model output cannot claim it completed an action")
    func modelCompletionFirewall() {
        let safe = ModelOutputPolicy.enforceNonAuthority("I’ve scheduled the meeting for tomorrow.")
        #expect(safe.contains("cannot perform or verify actions"))
        #expect(safe.contains("not changed anything"))

        let ordinary = "A shorter agenda would make the meeting easier to run."
        #expect(ModelOutputPolicy.enforceNonAuthority(ordinary) == ordinary)
    }

    @Test("Older saved workspaces enable the new on-device intelligence setting safely")
    func trustSettingsMigration() throws {
        let legacy = """
        {
          "awarenessEnabled": true,
          "actionsEnabled": true,
          "cloudIntelligenceEnabled": false,
          "backgroundIntelligenceEnabled": false,
          "localOnly": true,
          "calendarRead": true,
          "calendarWrite": true,
          "notifications": false
        }
        """
        let decoded = try JSONDecoder().decode(TrustSettings.self, from: Data(legacy.utf8))
        #expect(decoded.onDeviceIntelligenceEnabled)
        #expect(decoded.cloudIntelligenceEnabled == false)
        #expect(decoded.remindersRead)
        #expect(decoded.remindersWrite)
        #expect(decoded.messagesRead == false)
        #expect(decoded.messagesAutoReply == false)
        #expect(decoded.externalModelPolicy == .zeroSpend)
        #expect(decoded.siriIntelligenceEnabled)
        #expect(decoded.siriKnowledgeIndexingEnabled)
    }

    @Test("Zero automatic budget blocks every silent external-model call")
    func zeroAutomaticBudget() async throws {
        let gate = ExternalModelApprovalGate()
        let request = ExternalModelRequest(
            modelID: "gpt-5.6-luna",
            requestClass: "short-answer",
            purpose: "Answer a foreground question",
            contextDisclosure: "Current user message only",
            maximumInputTokens: 6_000,
            maximumOutputTokens: 600,
            maximumEstimatedCostCents: 1,
            isAutomatic: true
        )

        await #expect(throws: ExternalModelPolicyError.automaticSpendDisabled) {
            try await gate.authorize(request)
        }
    }

    @Test("Manual approval is exact and can be consumed only once")
    func singleUseExternalApproval() async throws {
        let gate = ExternalModelApprovalGate()
        let request = ExternalModelRequest(
            modelID: "gpt-5.6-terra",
            requestClass: "planning",
            purpose: "Synthesize a plan",
            contextDisclosure: "User-selected conversation excerpt",
            maximumInputTokens: 12_000,
            maximumOutputTokens: 1_200,
            maximumEstimatedCostCents: 5
        )
        _ = try await gate.propose(request)
        let receipt = try await gate.approve(requestID: request.id, from: .iPhone)
        let authorization = try await gate.authorize(request, receipt: receipt)
        #expect(authorization.requestID == request.id)

        await #expect(throws: ExternalModelPolicyError.approvalAlreadyConsumed) {
            try await gate.authorize(request, receipt: receipt)
        }
    }

    @Test("Approval cannot be applied to modified context or ceilings")
    func correlationBoundExternalApproval() async throws {
        let gate = ExternalModelApprovalGate()
        let request = ExternalModelRequest(
            modelID: "gpt-5.6-sol",
            requestClass: "high-value-reasoning",
            purpose: "Evaluate a consequential decision",
            contextDisclosure: "Decision brief only",
            maximumInputTokens: 20_000,
            maximumOutputTokens: 2_000,
            maximumEstimatedCostCents: 20
        )
        _ = try await gate.propose(request)
        let receipt = try await gate.approve(requestID: request.id, from: .mac)
        let changed = ExternalModelRequest(
            id: request.id,
            modelID: request.modelID,
            requestClass: request.requestClass,
            purpose: request.purpose,
            contextDisclosure: "Entire conversation history",
            maximumInputTokens: request.maximumInputTokens,
            maximumOutputTokens: request.maximumOutputTokens,
            maximumEstimatedCostCents: request.maximumEstimatedCostCents
        )

        await #expect(throws: ExternalModelPolicyError.approvalDoesNotMatch) {
            try await gate.authorize(changed, receipt: receipt)
        }
    }

    @Test("Bridge rejects action envelopes that do not require approval")
    func bridgeApprovalBoundary() throws {
        let envelope = BridgeEnvelope(
            kind: .request,
            source: "monday",
            target: "nav",
            capability: "act.startRoute",
            payload: Data("{}".utf8),
            requiresApproval: false
        )
        #expect(throws: BridgeValidationError.self) {
            try envelope.validate()
        }
    }

    @Test("Bridge accepts an action only with a correlation-bound approval receipt")
    func bridgeApprovalReceipt() throws {
        let correlationID = UUID()
        let envelope = BridgeEnvelope(
            kind: .request,
            correlationID: correlationID,
            source: "monday",
            target: "nav",
            capability: "act.startRoute",
            payload: Data("{}".utf8),
            requiresApproval: true,
            approvalReceipt: BridgeApprovalReceipt(
                correlationID: correlationID,
                approvingSurface: .iPhone
            )
        )
        try envelope.validate()
    }

    @Test("Connection reconciliation preserves user policy without overstating health")
    func connectionReconciliation() {
        let manifest = SpecialistManifest(
            id: "nav",
            displayName: "NAV",
            domain: "Navigation",
            bundleIdentifiers: ["com.binion.nav"],
            summary: "Navigation specialist",
            systemImage: "location.fill",
            transports: [.appGroupBridge],
            dataCategories: ["Routes"],
            capabilities: ["Plan route"],
            verificationMethod: "Read-back"
        )
        let saved = SpecialistConnection(
            manifest: manifest,
            state: .connected,
            statusDetail: "Previously connected",
            policy: ConnectionPolicy(observe: true, importData: true)
        )
        let current = SpecialistConnection(
            manifest: manifest,
            state: .adapterRequired,
            statusDetail: "Adapter not installed"
        )
        let merged = ConnectionRegistry.reconcile(saved: [saved], discovered: [current])
        #expect(merged[0].policy.observe)
        #expect(merged[0].state == .adapterRequired)
    }

    @Test("A verified specialist handshake survives capability refresh")
    func verifiedConnectionSurvivesRefresh() {
        let manifest = SpecialistManifest(
            id: "nav",
            displayName: "NAV",
            domain: "navigation",
            bundleIdentifiers: ["com.binion.nav"],
            summary: "Navigation specialist",
            systemImage: "location",
            transports: [.appGroupBridge],
            dataCategories: ["routes"],
            capabilities: ["route.plan"],
            verificationMethod: "Specialist acknowledgment"
        )
        let verifiedAt = Date(timeIntervalSince1970: 1_700_000_000)
        let saved = SpecialistConnection(
            manifest: manifest,
            state: .connected,
            statusDetail: "NAV acknowledged the bridge handshake.",
            lastVerifiedAt: verifiedAt
        )
        let discovered = SpecialistConnection(
            manifest: manifest,
            state: .adapterRequired,
            statusDetail: "Adapter not yet verified."
        )

        let merged = ConnectionRegistry.reconcile(saved: [saved], discovered: [discovered])

        #expect(merged[0].state == .connected)
        #expect(merged[0].lastVerifiedAt == verifiedAt)
        #expect(merged[0].statusDetail == "NAV acknowledged the bridge handshake.")
    }

    @Test("Bridge mailbox transfers and acknowledges a versioned envelope")
    func bridgeMailboxRoundTrip() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let mailbox = FileBridgeMailbox(rootURL: root)
        let envelope = BridgeEnvelope(
            kind: .request,
            source: "monday",
            target: "chronicle",
            capability: "observe.timeline",
            payload: Data("{\"query\":\"today\"}".utf8),
            requiresApproval: false
        )
        try await mailbox.send(envelope)
        let pending = try await mailbox.pending(for: "chronicle")
        #expect(pending.map(\.id) == [envelope.id])
        try await mailbox.acknowledge(envelope.id, for: "chronicle")
        #expect(try await mailbox.pending(for: "chronicle").isEmpty)
    }

    @Test("Model use is recorded with route, boundary, and reported cost")
    func modelUsageLedger() async throws {
        let engine = MondayEngine(store: InMemoryContinuityStore(), specialists: [TestIntelligenceSpecialist()])
        _ = try await engine.start(surface: .iPad)
        let workspace = try await engine.send("Answer this", from: .iPad)

        #expect(workspace.modelUsage.count == 1)
        #expect(workspace.modelUsage[0].route == .onDevice)
        #expect(workspace.modelUsage[0].personalContextLeftDevice == false)
        #expect(workspace.modelUsage[0].reportedCostUSD == 0)
    }

    @Test("An action is proposed but never executed without approval")
    func approvalBoundary() async throws {
        let specialist = TestSpecialist()
        let engine = MondayEngine(store: InMemoryContinuityStore(), specialists: [specialist])
        _ = try await engine.start()
        let proposed = try await engine.send("Protect an hour for focus", from: .mac)

        #expect(proposed.actions.count == 1)
        #expect(proposed.actions[0].status == .proposed)
        #expect(await specialist.executionCount() == 0)

        let completed = try await engine.approve(actionID: proposed.actions[0].id, from: .watch)
        #expect(completed.actions[0].status == .verified)
        #expect(await specialist.executionCount() == 1)
        #expect(completed.audit.contains { $0.category == "approval" && $0.surface == .watch })
    }

    @Test("Global stop blocks proposed work")
    func globalStop() async throws {
        let specialist = TestSpecialist()
        let engine = MondayEngine(store: InMemoryContinuityStore(), specialists: [specialist])
        _ = try await engine.start()
        let proposed = try await engine.send("Protect focus time", from: .mac)
        let stopped = try await engine.emergencyStop(from: .iPhone)

        #expect(stopped.settings.actionsEnabled == false)
        #expect(stopped.actions[0].status == .declined)

        _ = try await engine.approve(actionID: proposed.actions[0].id, from: .watch)
        #expect(await specialist.executionCount() == 0)
    }

    @Test("Continuity preserves the originating and approving surfaces")
    func continuityAcrossSurfaces() async throws {
        let store = InMemoryContinuityStore()
        let engine = MondayEngine(store: store, specialists: [TestSpecialist()])
        _ = try await engine.start(surface: .mac)
        _ = try await engine.send("I am leaving—resume this in CarPlay", from: .iPhone)

        let resumed = MondayEngine(store: store, specialists: [TestSpecialist()])
        let snapshot = try await resumed.start(surface: .carPlay)
        #expect(snapshot.lastSurface == .carPlay)
        #expect(snapshot.openLoops.contains { $0.title == "Resume during the drive" })
        #expect(snapshot.messages.contains { $0.surface == .iPhone })
    }
}
