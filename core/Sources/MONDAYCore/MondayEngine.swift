import Foundation

public actor MondayEngine {
    private let store: any ContinuityStore
    private var specialists: [any MondaySpecialist]
    private var workspace: MondayWorkspace

    public init(store: any ContinuityStore, specialists: [any MondaySpecialist]) {
        self.store = store
        self.specialists = specialists
        self.workspace = MondayWorkspace()
    }

    @discardableResult
    public func start(surface: MondaySurface = .mac) async throws -> MondayWorkspace {
        if let saved = try await store.load() {
            workspace = saved
            workspace.lastSurface = surface
            workspace.lastUpdated = .now
        } else {
            workspace = MondayWorkspace(
                messages: [
                    ConversationMessage(
                        role: .monday,
                        text: "Morning, Chris. I’m here, private by default, and ready to make something meaningfully easier—not merely discuss it.",
                        surface: surface,
                        evidence: [
                            Evidence(
                                kind: .observed,
                                source: "MONDAY trust policy",
                                claim: "Cloud and background intelligence are off.",
                                confidence: .verified
                            )
                        ]
                    )
                ],
                openLoops: [
                    OpenLoop(
                        title: "Choose today’s protected focus window",
                        detail: "MONDAY can inspect your calendar and prepare a reversible focus block after approval.",
                        originatingSurface: surface
                    )
                ],
                audit: [
                    AuditRecord(
                        category: "session",
                        summary: "Created a new local continuity workspace",
                        surface: surface,
                        outcome: "Verified local persistence"
                    )
                ],
                lastSurface: surface
            )
        }
        try await persist()
        return workspace
    }

    public func snapshot() -> MondayWorkspace { workspace }

    public func capabilities() async -> [CapabilityDescriptor] {
        var result: [CapabilityDescriptor] = []
        for specialist in specialists {
            result.append(await specialist.descriptor)
        }
        return result
    }

    @discardableResult
    public func send(_ text: String, from surface: MondaySurface) async throws -> MondayWorkspace {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return workspace }

        workspace.lastSurface = surface
        workspace.messages.append(ConversationMessage(role: .user, text: trimmed, surface: surface))

        let request = SpecialistRequest(text: trimmed, surface: surface, workspace: workspace)
        var response: SpecialistResponse?
        for specialist in specialists where await specialist.canHandle(request) {
            do {
                response = try await specialist.respond(to: request)
            } catch {
                response = SpecialistResponse(
                    narrative: "I couldn’t use that capability: \(error.localizedDescription). I haven’t claimed or changed anything.",
                    evidence: [
                        Evidence(kind: .attempted, source: "Capability router", claim: error.localizedDescription, confidence: .verified)
                    ]
                )
            }
            break
        }

        let resolved = response ?? generalResponse(to: trimmed, surface: surface)
        workspace.messages.append(
            ConversationMessage(
                role: .monday,
                text: resolved.narrative,
                surface: surface,
                evidence: resolved.evidence
            )
        )

        if var proposal = resolved.proposal {
            let policyAllowsProposal = workspace.settings.actionsEnabled
            if policyAllowsProposal {
                proposal.status = .proposed
                workspace.actions.append(proposal)
                workspace.openLoops.append(
                    OpenLoop(
                        title: proposal.title,
                        detail: "Awaiting explicit approval before MONDAY acts.",
                        status: .awaitingApproval,
                        originatingSurface: surface
                    )
                )
            } else {
                workspace.messages.append(
                    ConversationMessage(
                        role: .system,
                        text: "Action blocked by the global do-not-act control.",
                        surface: surface
                    )
                )
            }
        }
        if let loop = resolved.openLoop { workspace.openLoops.append(loop) }
        if let usage = resolved.modelUsage { workspace.modelUsage.append(usage) }
        workspace.audit.append(
            AuditRecord(
                category: "conversation",
                summary: "Handled request locally",
                surface: surface,
                outcome: resolved.proposal == nil ? "Response recorded" : "Proposal prepared; no action taken"
            )
        )
        try await persist()
        return workspace
    }

    @discardableResult
    public func approve(actionID: UUID, from surface: MondaySurface) async throws -> MondayWorkspace {
        guard workspace.settings.actionsEnabled else {
            return try await recordBlocked("Global do-not-act is enabled.", surface: surface)
        }
        guard let index = workspace.actions.firstIndex(where: { $0.id == actionID }) else {
            return try await recordBlocked("The proposed action no longer exists.", surface: surface)
        }
        guard workspace.actions[index].status == .proposed else {
            return try await recordBlocked("That action is no longer awaiting approval.", surface: surface)
        }
        if let connection = workspace.connections.first(where: { $0.id == workspace.actions[index].capabilityID }),
           !connection.policy.actWithApproval {
            return try await recordBlocked("Action authority is disabled for \(connection.manifest.displayName).", surface: surface)
        }

        workspace.actions[index].status = .approved
        workspace.audit.append(
            AuditRecord(
                category: "approval",
                summary: "Chris approved \(workspace.actions[index].title)",
                surface: surface,
                actionID: actionID,
                outcome: "Execution authorized once"
            )
        )
        workspace.actions[index].status = .executing
        let proposal = workspace.actions[index]

        guard let specialist = await specialist(for: proposal.capabilityID) else {
            workspace.actions[index].status = .failed
            workspace.actions[index].verification = "No healthy specialist was registered."
            return try await recordBlocked("The specialist disappeared before execution. Nothing changed.", surface: surface)
        }

        do {
            let result = try await specialist.execute(proposal)
            workspace.actions[index].status = result.succeeded ? .verified : .failed
            workspace.actions[index].completedAt = .now
            workspace.actions[index].verification = result.verification ?? result.attempted
            workspace.messages.append(
                ConversationMessage(
                    role: .monday,
                    text: result.succeeded
                        ? "Done—and verified. \(result.verification ?? result.attempted)"
                        : "I attempted it, but I could not verify the outcome. \(result.attempted)",
                    surface: surface,
                    evidence: result.evidence
                )
            )
            workspace.audit.append(
                AuditRecord(
                    category: "action",
                    summary: proposal.title,
                    surface: surface,
                    actionID: actionID,
                    outcome: result.succeeded ? "Verified" : "Unverified"
                )
            )
            if result.succeeded,
               let loopIndex = workspace.openLoops.firstIndex(where: { $0.title == proposal.title && $0.status == .awaitingApproval }) {
                workspace.openLoops[loopIndex].status = .completed
                workspace.openLoops[loopIndex].updatedAt = .now
            }
        } catch {
            workspace.actions[index].status = .failed
            workspace.actions[index].completedAt = .now
            workspace.actions[index].verification = error.localizedDescription
            workspace.messages.append(
                ConversationMessage(
                    role: .monday,
                    text: "I tried, but the action failed: \(error.localizedDescription). I did not mark it complete.",
                    surface: surface,
                    evidence: [Evidence(kind: .attempted, source: proposal.capabilityID, claim: error.localizedDescription, confidence: .verified)]
                )
            )
        }
        try await persist()
        return workspace
    }

    @discardableResult
    public func decline(actionID: UUID, from surface: MondaySurface) async throws -> MondayWorkspace {
        guard let index = workspace.actions.firstIndex(where: { $0.id == actionID }),
              workspace.actions[index].status == .proposed else { return workspace }
        workspace.actions[index].status = .declined
        workspace.actions[index].completedAt = .now
        workspace.audit.append(
            AuditRecord(category: "approval", summary: workspace.actions[index].title, surface: surface, actionID: actionID, outcome: "Declined; no action taken")
        )
        if let loopIndex = workspace.openLoops.firstIndex(where: { $0.title == workspace.actions[index].title && $0.status == .awaitingApproval }) {
            workspace.openLoops[loopIndex].status = .abandoned
            workspace.openLoops[loopIndex].updatedAt = .now
        }
        try await persist()
        return workspace
    }

    @discardableResult
    public func updateSettings(_ settings: TrustSettings, from surface: MondaySurface) async throws -> MondayWorkspace {
        let previous = workspace.settings
        workspace.settings = settings
        workspace.lastSurface = surface
        workspace.audit.append(
            AuditRecord(
                category: "policy",
                summary: "Trust settings changed",
                surface: surface,
                outcome: policyDifference(from: previous, to: settings)
            )
        )
        try await persist()
        return workspace
    }

    @discardableResult
    public func updateConnections(_ connections: [SpecialistConnection], from surface: MondaySurface) async throws -> MondayWorkspace {
        workspace.connections = connections
        workspace.lastSurface = surface
        workspace.audit.append(
            AuditRecord(
                category: "connections",
                summary: "Connection registry updated",
                surface: surface,
                outcome: "\(connections.filter { $0.state == .connected }.count) verified connection(s); policies preserved"
            )
        )
        try await persist()
        return workspace
    }

    @discardableResult
    public func ingestBridgeEnvelope(_ envelope: BridgeEnvelope, from surface: MondaySurface) async throws -> MondayWorkspace {
        try envelope.validate()
        guard envelope.target == "monday" else {
            throw SpecialistError.invalidProposal("The bridge result was addressed to \(envelope.target), not MONDAY.")
        }
        guard envelope.kind == .result || envelope.kind == .observation else {
            throw SpecialistError.invalidProposal("MONDAY accepts only specialist results or observations in its inbox.")
        }
        guard let connectionIndex = workspace.connections.firstIndex(where: { $0.id == envelope.source }) else {
            throw SpecialistError.unavailable("No declared connection matches bridge source \(envelope.source).")
        }

        let payload = try JSONDecoder().decode(BridgeResultPayload.self, from: envelope.payload)
        workspace.connections[connectionIndex].lastTransferAt = .now

        if envelope.capability == "system.handshake", payload.status == .verified {
            workspace.connections[connectionIndex].state = .connected
            workspace.connections[connectionIndex].statusDetail = payload.verification ?? payload.narrative
            workspace.connections[connectionIndex].lastVerifiedAt = .now
        } else {
            workspace.messages.append(
                ConversationMessage(
                    role: .monday,
                    text: payload.narrative,
                    surface: surface,
                    evidence: payload.evidence
                )
            )
        }

        workspace.audit.append(
            AuditRecord(
                category: "bridge",
                summary: "Received \(envelope.capability) from \(workspace.connections[connectionIndex].manifest.displayName)",
                surface: surface,
                outcome: payload.verification ?? payload.status.rawValue
            )
        )
        try await persist()
        return workspace
    }

    @discardableResult
    public func emergencyStop(from surface: MondaySurface) async throws -> MondayWorkspace {
        workspace.settings.actionsEnabled = false
        workspace.settings.backgroundIntelligenceEnabled = false
        for index in workspace.actions.indices where workspace.actions[index].status == .proposed {
            workspace.actions[index].status = .declined
            workspace.actions[index].completedAt = .now
            workspace.actions[index].verification = "Cancelled by global stop."
        }
        workspace.audit.append(
            AuditRecord(category: "policy", summary: "Global stop activated", surface: surface, outcome: "New actions blocked; pending proposals cancelled")
        )
        workspace.messages.append(
            ConversationMessage(role: .system, text: "Global stop is active. MONDAY can converse, but it cannot act or run background intelligence.", surface: surface)
        )
        try await persist()
        return workspace
    }

    private func specialist(for capabilityID: String) async -> (any MondaySpecialist)? {
        for specialist in specialists where await specialist.descriptor.id == capabilityID {
            return specialist
        }
        return nil
    }

    private func generalResponse(to text: String, surface: MondaySurface) -> SpecialistResponse {
        let lower = text.lowercased()
        if lower.contains("what matters") || lower.contains("attention") || lower.contains("open loop") {
            let active = workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
            let summary = active.isEmpty
                ? "You’re clear. I don’t have an authorized open loop that needs your attention."
                : "The one thing I’d protect is \(active[0].title.lowercased()). I have \(active.count) open loop\(active.count == 1 ? "" : "s") total, and I won’t act on any of them without the policy-required approval."
            return SpecialistResponse(
                narrative: summary,
                evidence: [Evidence(kind: .remembered, source: "Local continuity store", claim: "\(active.count) active open loops", confidence: .verified)]
            )
        }
        if lower.contains("carplay") || lower.contains("leaving") || lower.contains("drive") {
            return SpecialistResponse(
                narrative: "I’ve preserved this as a driving handoff. In CarPlay I’ll keep it brief: destination context, the next commitment, and one safe action at a time.",
                evidence: [Evidence(kind: .inferred, source: "Surface policy", claim: "Driving context requires concise, low-distraction interaction.", confidence: .high)],
                openLoop: OpenLoop(title: "Resume during the drive", detail: text, status: .scheduled, originatingSurface: surface)
            )
        }
        return SpecialistResponse(
            narrative: "I see what you’re after. I don’t yet have a specialist that can carry this one through, and inventing competence would be a rather poor personality trait. I’ve kept the request intact without pretending it’s done.",
            evidence: [Evidence(kind: .observed, source: "Capability registry", claim: "No matching executable capability is registered.", confidence: .verified)]
        )
    }

    private func recordBlocked(_ reason: String, surface: MondaySurface) async throws -> MondayWorkspace {
        workspace.messages.append(ConversationMessage(role: .system, text: reason, surface: surface))
        workspace.audit.append(AuditRecord(category: "action", summary: "Action blocked", surface: surface, outcome: reason))
        try await persist()
        return workspace
    }

    private func policyDifference(from previous: TrustSettings, to next: TrustSettings) -> String {
        var changes: [String] = []
        if previous.actionsEnabled != next.actionsEnabled { changes.append("actions \(next.actionsEnabled ? "enabled" : "disabled")") }
        if previous.calendarRead != next.calendarRead { changes.append("calendar read \(next.calendarRead ? "enabled" : "disabled")") }
        if previous.calendarWrite != next.calendarWrite { changes.append("calendar write \(next.calendarWrite ? "enabled" : "disabled")") }
        if previous.remindersRead != next.remindersRead { changes.append("reminders read \(next.remindersRead ? "enabled" : "disabled")") }
        if previous.remindersWrite != next.remindersWrite { changes.append("reminders write \(next.remindersWrite ? "enabled" : "disabled")") }
        if previous.onDeviceIntelligenceEnabled != next.onDeviceIntelligenceEnabled { changes.append("on-device intelligence \(next.onDeviceIntelligenceEnabled ? "enabled" : "disabled")") }
        if previous.cloudIntelligenceEnabled != next.cloudIntelligenceEnabled { changes.append("Apple Private Cloud Compute \(next.cloudIntelligenceEnabled ? "enabled" : "disabled")") }
        if previous.siriIntelligenceEnabled != next.siriIntelligenceEnabled { changes.append("Siri AI access \(next.siriIntelligenceEnabled ? "enabled" : "disabled")") }
        if previous.siriKnowledgeIndexingEnabled != next.siriKnowledgeIndexingEnabled { changes.append("Siri knowledge indexing \(next.siriKnowledgeIndexingEnabled ? "enabled" : "disabled")") }
        if previous.localOnly != next.localOnly { changes.append("local-only \(next.localOnly ? "enabled" : "disabled")") }
        return changes.isEmpty ? "No material policy change" : changes.joined(separator: ", ")
    }

    private func persist() async throws {
        workspace.lastUpdated = .now
        try await store.save(workspace)
    }
}
