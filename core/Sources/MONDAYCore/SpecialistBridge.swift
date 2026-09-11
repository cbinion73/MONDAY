import Foundation

public enum ConnectionTransport: String, Codable, CaseIterable, Sendable {
    case appleFramework
    case appGroupBridge
    case appIntent
    case shareExtension
    case universalLink

    public var displayName: String {
        switch self {
        case .appleFramework: "Apple framework"
        case .appGroupBridge: "MONDAY Bridge"
        case .appIntent: "App Intents and Shortcuts"
        case .shareExtension: "Share extension"
        case .universalLink: "Universal link"
        }
    }
}

public enum ConnectionState: String, Codable, Sendable {
    case connected
    case needsPermission
    case adapterRequired
    case unavailable

    public var displayName: String {
        switch self {
        case .connected: "Connected"
        case .needsPermission: "Needs permission"
        case .adapterRequired: "Adapter required"
        case .unavailable: "Unavailable"
        }
    }
}

public struct ConnectionPolicy: Codable, Equatable, Sendable {
    public var observe: Bool
    public var importData: Bool
    public var recommend: Bool
    public var actWithApproval: Bool
    public var backgroundRefresh: Bool
    public var crossDeviceSync: Bool

    public init(
        observe: Bool = false,
        importData: Bool = false,
        recommend: Bool = false,
        actWithApproval: Bool = false,
        backgroundRefresh: Bool = false,
        crossDeviceSync: Bool = false
    ) {
        self.observe = observe
        self.importData = importData
        self.recommend = recommend
        self.actWithApproval = actWithApproval
        self.backgroundRefresh = backgroundRefresh
        self.crossDeviceSync = crossDeviceSync
    }
}

public struct SpecialistManifest: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let version: Int
    public let displayName: String
    public let domain: String
    public let bundleIdentifiers: [String]
    public let summary: String
    public let systemImage: String
    public let transports: [ConnectionTransport]
    public let dataCategories: [String]
    public let capabilities: [String]
    public let verificationMethod: String

    public init(
        id: String,
        version: Int = 1,
        displayName: String,
        domain: String,
        bundleIdentifiers: [String],
        summary: String,
        systemImage: String,
        transports: [ConnectionTransport],
        dataCategories: [String],
        capabilities: [String],
        verificationMethod: String
    ) {
        self.id = id
        self.version = version
        self.displayName = displayName
        self.domain = domain
        self.bundleIdentifiers = bundleIdentifiers
        self.summary = summary
        self.systemImage = systemImage
        self.transports = transports
        self.dataCategories = dataCategories
        self.capabilities = capabilities
        self.verificationMethod = verificationMethod
    }
}

public struct SpecialistConnection: Codable, Identifiable, Equatable, Sendable {
    public let id: String
    public var manifest: SpecialistManifest
    public var state: ConnectionState
    public var statusDetail: String
    public var policy: ConnectionPolicy
    public var lastVerifiedAt: Date?
    public var lastTransferAt: Date?

    public init(
        manifest: SpecialistManifest,
        state: ConnectionState,
        statusDetail: String,
        policy: ConnectionPolicy = .init(),
        lastVerifiedAt: Date? = nil,
        lastTransferAt: Date? = nil
    ) {
        self.id = manifest.id
        self.manifest = manifest
        self.state = state
        self.statusDetail = statusDetail
        self.policy = policy
        self.lastVerifiedAt = lastVerifiedAt
        self.lastTransferAt = lastTransferAt
    }
}

public enum BridgeEnvelopeKind: String, Codable, Sendable {
    case request
    case result
    case observation
    case revocation
}

public enum BridgeResultStatus: String, Codable, Sendable {
    case accepted
    case verified
    case failed
    case unverified
}

public struct BridgeResultPayload: Codable, Sendable {
    public let status: BridgeResultStatus
    public let narrative: String
    public let verification: String?
    public let evidence: [Evidence]
    public let specialistRecordID: String?
    public let specialistRevision: String?

    public init(
        status: BridgeResultStatus,
        narrative: String,
        verification: String? = nil,
        evidence: [Evidence] = [],
        specialistRecordID: String? = nil,
        specialistRevision: String? = nil
    ) {
        self.status = status
        self.narrative = narrative
        self.verification = verification
        self.evidence = evidence
        self.specialistRecordID = specialistRecordID
        self.specialistRevision = specialistRevision
    }
}

public struct BridgeApprovalReceipt: Codable, Equatable, Sendable {
    public let id: UUID
    public let correlationID: UUID
    public let approvedAt: Date
    public let approvingSurface: MondaySurface

    public init(
        id: UUID = UUID(),
        correlationID: UUID,
        approvedAt: Date = .now,
        approvingSurface: MondaySurface
    ) {
        self.id = id
        self.correlationID = correlationID
        self.approvedAt = approvedAt
        self.approvingSurface = approvingSurface
    }
}

public struct BridgeEnvelope: Codable, Identifiable, Sendable {
    public let id: UUID
    public let contractVersion: Int
    public let kind: BridgeEnvelopeKind
    public let correlationID: UUID
    public let source: String
    public let target: String
    public let capability: String
    public let contentType: String
    public let payload: Data
    public let issuedAt: Date
    public let expiresAt: Date
    public let requiresApproval: Bool
    public let approvalReceipt: BridgeApprovalReceipt?
    public let idempotencyKey: String

    public init(
        id: UUID = UUID(),
        contractVersion: Int = 1,
        kind: BridgeEnvelopeKind,
        correlationID: UUID = UUID(),
        source: String,
        target: String,
        capability: String,
        contentType: String = "application/json",
        payload: Data,
        issuedAt: Date = .now,
        expiresAt: Date = .now.addingTimeInterval(300),
        requiresApproval: Bool,
        approvalReceipt: BridgeApprovalReceipt? = nil,
        idempotencyKey: String = UUID().uuidString
    ) {
        self.id = id
        self.contractVersion = contractVersion
        self.kind = kind
        self.correlationID = correlationID
        self.source = source
        self.target = target
        self.capability = capability
        self.contentType = contentType
        self.payload = payload
        self.issuedAt = issuedAt
        self.expiresAt = expiresAt
        self.requiresApproval = requiresApproval
        self.approvalReceipt = approvalReceipt
        self.idempotencyKey = idempotencyKey
    }

    public func validate(now: Date = .now) throws {
        guard contractVersion == 1 else { throw BridgeValidationError.unsupportedContract(contractVersion) }
        guard !source.isEmpty, !target.isEmpty, !capability.isEmpty else { throw BridgeValidationError.missingRouting }
        guard expiresAt > now else { throw BridgeValidationError.expired }
        guard !idempotencyKey.isEmpty else { throw BridgeValidationError.missingIdempotencyKey }
        if kind == .request, capability.hasPrefix("act."), !requiresApproval {
            throw BridgeValidationError.actionRequiresApproval
        }
        if kind == .request, capability.hasPrefix("act."), approvalReceipt == nil {
            throw BridgeValidationError.missingApprovalReceipt
        }
        if let approvalReceipt, approvalReceipt.correlationID != correlationID {
            throw BridgeValidationError.approvalCorrelationMismatch
        }
    }
}

public enum BridgeValidationError: LocalizedError, Sendable {
    case unsupportedContract(Int)
    case missingRouting
    case expired
    case missingIdempotencyKey
    case actionRequiresApproval
    case missingApprovalReceipt
    case approvalCorrelationMismatch

    public var errorDescription: String? {
        switch self {
        case .unsupportedContract(let version): "Unsupported MONDAY Bridge contract version \(version)."
        case .missingRouting: "The bridge envelope is missing its source, target, or capability."
        case .expired: "The bridge envelope expired before execution."
        case .missingIdempotencyKey: "The bridge envelope cannot be safely retried without an idempotency key."
        case .actionRequiresApproval: "A specialist action cannot cross the bridge without an approval requirement."
        case .missingApprovalReceipt: "A specialist action cannot execute without a MONDAY approval receipt."
        case .approvalCorrelationMismatch: "The approval receipt does not belong to this bridge request."
        }
    }
}

public enum ConnectionRegistry {
    public static func reconcile(
        saved: [SpecialistConnection],
        discovered: [SpecialistConnection]
    ) -> [SpecialistConnection] {
        let savedByID = Dictionary(uniqueKeysWithValues: saved.map { ($0.id, $0) })
        return discovered.map { current in
            guard let prior = savedByID[current.id] else { return current }
            var merged = current
            merged.policy = prior.policy
            merged.lastTransferAt = prior.lastTransferAt
            if current.lastVerifiedAt == nil { merged.lastVerifiedAt = prior.lastVerifiedAt }
            if current.state == .adapterRequired,
               prior.state == .connected,
               prior.lastVerifiedAt != nil {
                merged.state = .connected
                merged.statusDetail = prior.statusDetail
            }
            return merged
        }
    }
}

public actor FileBridgeMailbox {
    private let rootURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(rootURL: URL) {
        self.rootURL = rootURL
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
    }

    public func send(_ envelope: BridgeEnvelope) throws {
        try envelope.validate()
        let inbox = inboxURL(for: envelope.target)
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let destination = inbox.appendingPathComponent("\(envelope.id.uuidString).json")
        try encoder.encode(envelope).write(to: destination, options: [.atomic, .completeFileProtection])
    }

    public func pending(for target: String, now: Date = .now) throws -> [BridgeEnvelope] {
        let inbox = inboxURL(for: target)
        guard FileManager.default.fileExists(atPath: inbox.path) else { return [] }
        return try FileManager.default.contentsOfDirectory(
            at: inbox,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        .filter { $0.pathExtension == "json" }
        .compactMap { url in
            guard let data = try? Data(contentsOf: url),
                  let envelope = try? decoder.decode(BridgeEnvelope.self, from: data),
                  envelope.expiresAt > now else { return nil }
            return envelope
        }
        .sorted { $0.issuedAt < $1.issuedAt }
    }

    public func acknowledge(_ envelopeID: UUID, for target: String) throws {
        let url = inboxURL(for: target).appendingPathComponent("\(envelopeID.uuidString).json")
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        try FileManager.default.removeItem(at: url)
    }

    private func inboxURL(for target: String) -> URL {
        rootURL
            .appendingPathComponent(target, isDirectory: true)
            .appendingPathComponent("inbox", isDirectory: true)
    }
}
