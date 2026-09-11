import Foundation
import MONDAYCore

actor MobileBridgeCoordinator {
    static let appGroupIdentifier = "group.com.binion.monday.bridge"
    private static let pendingHandshakeKey = "monday.bridge.pending-handshakes.v1"

    func sendHandshake(to target: String) async throws -> UUID {
        let correlationID = UUID()
        let payload = try JSONEncoder().encode([
            "contractVersion": "1",
            "requester": "monday"
        ])
        let envelope = BridgeEnvelope(
            kind: .request,
            correlationID: correlationID,
            source: "monday",
            target: target,
            capability: "system.handshake",
            payload: payload,
            requiresApproval: false
        )
        try await mailbox().send(envelope)
        var pending = pendingHandshakeIDs()
        pending.insert(correlationID.uuidString)
        UserDefaults.standard.set(Array(pending), forKey: Self.pendingHandshakeKey)
        return correlationID
    }

    func consumeExpectedHandshake(_ envelope: BridgeEnvelope) -> Bool {
        guard envelope.capability == "system.handshake" else { return true }
        var pending = pendingHandshakeIDs()
        guard pending.remove(envelope.correlationID.uuidString) != nil else { return false }
        UserDefaults.standard.set(Array(pending), forKey: Self.pendingHandshakeKey)
        return true
    }

    func pendingResults() async throws -> [BridgeEnvelope] {
        try await mailbox().pending(for: "monday")
    }

    func acknowledge(_ envelope: BridgeEnvelope) async throws {
        try await mailbox().acknowledge(envelope.id, for: "monday")
    }

    private func mailbox() throws -> FileBridgeMailbox {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier
        ) else {
            throw MobileBridgeError.appGroupUnavailable
        }
        return FileBridgeMailbox(rootURL: container.appendingPathComponent("MONDAYBridge", isDirectory: true))
    }

    private func pendingHandshakeIDs() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: Self.pendingHandshakeKey) ?? [])
    }
}

enum MobileBridgeError: LocalizedError {
    case appGroupUnavailable

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable:
            "The MONDAY App Group is not available in this signed build. Register and provision group.com.binion.monday.bridge first."
        }
    }
}
