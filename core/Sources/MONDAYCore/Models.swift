import Foundation

public enum MondaySurface: String, Codable, CaseIterable, Identifiable, Sendable {
    case mac
    case messages
    case iPhone
    case iPad
    case watch
    case carPlay

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .mac: "Mac"
        case .messages: "Messages"
        case .iPhone: "iPhone"
        case .iPad: "iPad"
        case .watch: "Watch"
        case .carPlay: "CarPlay"
        }
    }
}

public enum ProvenanceKind: String, Codable, Sendable {
    case observed
    case sourceClaim
    case remembered
    case inferred
    case recommended
    case attempted
    case verified
}

public enum Confidence: String, Codable, Sendable {
    case low
    case medium
    case high
    case verified
}

public struct Evidence: Codable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let kind: ProvenanceKind
    public let source: String
    public let claim: String
    public let confidence: Confidence
    public let capturedAt: Date

    public init(
        id: UUID = UUID(),
        kind: ProvenanceKind,
        source: String,
        claim: String,
        confidence: Confidence,
        capturedAt: Date = .now
    ) {
        self.id = id
        self.kind = kind
        self.source = source
        self.claim = claim
        self.confidence = confidence
        self.capturedAt = capturedAt
    }
}

public enum MessageRole: String, Codable, Sendable {
    case user
    case monday
    case system
}

public struct ConversationMessage: Codable, Identifiable, Sendable {
    public let id: UUID
    public let role: MessageRole
    public let text: String
    public let surface: MondaySurface
    public let createdAt: Date
    public let evidence: [Evidence]

    public init(
        id: UUID = UUID(),
        role: MessageRole,
        text: String,
        surface: MondaySurface,
        createdAt: Date = .now,
        evidence: [Evidence] = []
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.surface = surface
        self.createdAt = createdAt
        self.evidence = evidence
    }
}

public enum OpenLoopStatus: String, Codable, Sendable {
    case active
    case awaitingApproval
    case blocked
    case scheduled
    case completed
    case abandoned
}

public struct OpenLoop: Codable, Identifiable, Sendable {
    public let id: UUID
    public var title: String
    public var detail: String
    public var status: OpenLoopStatus
    public var createdAt: Date
    public var updatedAt: Date
    public var originatingSurface: MondaySurface

    public init(
        id: UUID = UUID(),
        title: String,
        detail: String,
        status: OpenLoopStatus = .active,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        originatingSurface: MondaySurface
    ) {
        self.id = id
        self.title = title
        self.detail = detail
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.originatingSurface = originatingSurface
    }
}

public enum ConsequenceLevel: String, Codable, Sendable {
    case observe
    case low
    case consequential
    case high
}

public enum ActionStatus: String, Codable, Sendable {
    case proposed
    case approved
    case executing
    case verified
    case failed
    case declined
}

public struct ActionProposal: Codable, Identifiable, Sendable {
    public let id: UUID
    public let capabilityID: String
    public let title: String
    public let explanation: String
    public let consequence: ConsequenceLevel
    public let parameters: [String: String]
    public let reversible: Bool
    public var status: ActionStatus
    public let proposedAt: Date
    public var completedAt: Date?
    public var verification: String?

    public init(
        id: UUID = UUID(),
        capabilityID: String,
        title: String,
        explanation: String,
        consequence: ConsequenceLevel,
        parameters: [String: String],
        reversible: Bool,
        status: ActionStatus = .proposed,
        proposedAt: Date = .now,
        completedAt: Date? = nil,
        verification: String? = nil
    ) {
        self.id = id
        self.capabilityID = capabilityID
        self.title = title
        self.explanation = explanation
        self.consequence = consequence
        self.parameters = parameters
        self.reversible = reversible
        self.status = status
        self.proposedAt = proposedAt
        self.completedAt = completedAt
        self.verification = verification
    }
}

public enum CapabilityHealth: String, Codable, Sendable {
    case available
    case needsPermission
    case unavailable
    case degraded
}

public struct CapabilityDescriptor: Codable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let owner: String
    public let summary: String
    public let appleTechnology: String
    public var health: CapabilityHealth
    public var statusDetail: String
    public let supportedSurfaces: [MondaySurface]
    public let actions: [String]
    public let verificationMethod: String

    public init(
        id: String,
        name: String,
        owner: String,
        summary: String,
        appleTechnology: String,
        health: CapabilityHealth,
        statusDetail: String,
        supportedSurfaces: [MondaySurface],
        actions: [String],
        verificationMethod: String
    ) {
        self.id = id
        self.name = name
        self.owner = owner
        self.summary = summary
        self.appleTechnology = appleTechnology
        self.health = health
        self.statusDetail = statusDetail
        self.supportedSurfaces = supportedSurfaces
        self.actions = actions
        self.verificationMethod = verificationMethod
    }
}

public struct AuditRecord: Codable, Identifiable, Sendable {
    public let id: UUID
    public let timestamp: Date
    public let category: String
    public let summary: String
    public let surface: MondaySurface
    public let actionID: UUID?
    public let outcome: String

    public init(
        id: UUID = UUID(),
        timestamp: Date = .now,
        category: String,
        summary: String,
        surface: MondaySurface,
        actionID: UUID? = nil,
        outcome: String
    ) {
        self.id = id
        self.timestamp = timestamp
        self.category = category
        self.summary = summary
        self.surface = surface
        self.actionID = actionID
        self.outcome = outcome
    }
}

public enum IntelligenceRoute: String, Codable, Sendable {
    case onDevice
    case privateCloudCompute

    public var displayName: String {
        switch self {
        case .onDevice: "On device"
        case .privateCloudCompute: "Private Cloud Compute"
        }
    }
}

public struct ModelUsageRecord: Codable, Identifiable, Sendable {
    public let id: UUID
    public let timestamp: Date
    public let provider: String
    public let model: String
    public let route: IntelligenceRoute
    public let purpose: String
    public let surface: MondaySurface
    public let inputCharacters: Int
    public let outputCharacters: Int
    public let invocationCount: Int
    public let personalContextLeftDevice: Bool
    public let reportedCostUSD: Double?

    public init(
        id: UUID = UUID(),
        timestamp: Date = .now,
        provider: String,
        model: String,
        route: IntelligenceRoute,
        purpose: String,
        surface: MondaySurface,
        inputCharacters: Int,
        outputCharacters: Int,
        invocationCount: Int = 1,
        personalContextLeftDevice: Bool,
        reportedCostUSD: Double? = nil
    ) {
        self.id = id
        self.timestamp = timestamp
        self.provider = provider
        self.model = model
        self.route = route
        self.purpose = purpose
        self.surface = surface
        self.inputCharacters = inputCharacters
        self.outputCharacters = outputCharacters
        self.invocationCount = invocationCount
        self.personalContextLeftDevice = personalContextLeftDevice
        self.reportedCostUSD = reportedCostUSD
    }
}

public struct TrustSettings: Codable, Equatable, Sendable {
    public var awarenessEnabled: Bool
    public var actionsEnabled: Bool
    public var cloudIntelligenceEnabled: Bool
    public var backgroundIntelligenceEnabled: Bool
    public var onDeviceIntelligenceEnabled: Bool
    public var localOnly: Bool
    public var calendarRead: Bool
    public var calendarWrite: Bool
    public var remindersRead: Bool
    public var remindersWrite: Bool
    public var messagesRead: Bool
    public var messagesAutoReply: Bool
    public var notifications: Bool
    public var externalModelPolicy: ExternalModelPolicy
    public var siriIntelligenceEnabled: Bool
    public var siriKnowledgeIndexingEnabled: Bool

    public init(
        awarenessEnabled: Bool = true,
        actionsEnabled: Bool = true,
        cloudIntelligenceEnabled: Bool = false,
        backgroundIntelligenceEnabled: Bool = false,
        onDeviceIntelligenceEnabled: Bool = true,
        localOnly: Bool = true,
        calendarRead: Bool = true,
        calendarWrite: Bool = true,
        remindersRead: Bool = true,
        remindersWrite: Bool = true,
        messagesRead: Bool = false,
        messagesAutoReply: Bool = false,
        notifications: Bool = false,
        externalModelPolicy: ExternalModelPolicy = .zeroSpend,
        siriIntelligenceEnabled: Bool = true,
        siriKnowledgeIndexingEnabled: Bool = true
    ) {
        self.awarenessEnabled = awarenessEnabled
        self.actionsEnabled = actionsEnabled
        self.cloudIntelligenceEnabled = cloudIntelligenceEnabled
        self.backgroundIntelligenceEnabled = backgroundIntelligenceEnabled
        self.onDeviceIntelligenceEnabled = onDeviceIntelligenceEnabled
        self.localOnly = localOnly
        self.calendarRead = calendarRead
        self.calendarWrite = calendarWrite
        self.remindersRead = remindersRead
        self.remindersWrite = remindersWrite
        self.messagesRead = messagesRead
        self.messagesAutoReply = messagesAutoReply
        self.notifications = notifications
        self.externalModelPolicy = externalModelPolicy
        self.siriIntelligenceEnabled = siriIntelligenceEnabled
        self.siriKnowledgeIndexingEnabled = siriKnowledgeIndexingEnabled
    }

    private enum CodingKeys: String, CodingKey {
        case awarenessEnabled
        case actionsEnabled
        case cloudIntelligenceEnabled
        case backgroundIntelligenceEnabled
        case onDeviceIntelligenceEnabled
        case localOnly
        case calendarRead
        case calendarWrite
        case remindersRead
        case remindersWrite
        case messagesRead
        case messagesAutoReply
        case notifications
        case externalModelPolicy
        case siriIntelligenceEnabled
        case siriKnowledgeIndexingEnabled
    }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        awarenessEnabled = try values.decodeIfPresent(Bool.self, forKey: .awarenessEnabled) ?? true
        actionsEnabled = try values.decodeIfPresent(Bool.self, forKey: .actionsEnabled) ?? true
        cloudIntelligenceEnabled = try values.decodeIfPresent(Bool.self, forKey: .cloudIntelligenceEnabled) ?? false
        backgroundIntelligenceEnabled = try values.decodeIfPresent(Bool.self, forKey: .backgroundIntelligenceEnabled) ?? false
        onDeviceIntelligenceEnabled = try values.decodeIfPresent(Bool.self, forKey: .onDeviceIntelligenceEnabled) ?? true
        localOnly = try values.decodeIfPresent(Bool.self, forKey: .localOnly) ?? true
        calendarRead = try values.decodeIfPresent(Bool.self, forKey: .calendarRead) ?? true
        calendarWrite = try values.decodeIfPresent(Bool.self, forKey: .calendarWrite) ?? true
        remindersRead = try values.decodeIfPresent(Bool.self, forKey: .remindersRead) ?? true
        remindersWrite = try values.decodeIfPresent(Bool.self, forKey: .remindersWrite) ?? true
        messagesRead = try values.decodeIfPresent(Bool.self, forKey: .messagesRead) ?? false
        messagesAutoReply = try values.decodeIfPresent(Bool.self, forKey: .messagesAutoReply) ?? false
        notifications = try values.decodeIfPresent(Bool.self, forKey: .notifications) ?? false
        externalModelPolicy = try values.decodeIfPresent(ExternalModelPolicy.self, forKey: .externalModelPolicy) ?? .zeroSpend
        siriIntelligenceEnabled = try values.decodeIfPresent(Bool.self, forKey: .siriIntelligenceEnabled) ?? true
        siriKnowledgeIndexingEnabled = try values.decodeIfPresent(Bool.self, forKey: .siriKnowledgeIndexingEnabled) ?? true
    }
}

public struct MondayWorkspace: Codable, Sendable {
    public var messages: [ConversationMessage]
    public var openLoops: [OpenLoop]
    public var actions: [ActionProposal]
    public var audit: [AuditRecord]
    public var modelUsage: [ModelUsageRecord]
    public var connections: [SpecialistConnection]
    public var settings: TrustSettings
    public var lastSurface: MondaySurface
    public var lastUpdated: Date

    public init(
        messages: [ConversationMessage] = [],
        openLoops: [OpenLoop] = [],
        actions: [ActionProposal] = [],
        audit: [AuditRecord] = [],
        modelUsage: [ModelUsageRecord] = [],
        connections: [SpecialistConnection] = [],
        settings: TrustSettings = .init(),
        lastSurface: MondaySurface = .mac,
        lastUpdated: Date = .now
    ) {
        self.messages = messages
        self.openLoops = openLoops
        self.actions = actions
        self.audit = audit
        self.modelUsage = modelUsage
        self.connections = connections
        self.settings = settings
        self.lastSurface = lastSurface
        self.lastUpdated = lastUpdated
    }

    private enum CodingKeys: String, CodingKey {
        case messages, openLoops, actions, audit, modelUsage, connections, settings, lastSurface, lastUpdated
    }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        messages = try values.decodeIfPresent([ConversationMessage].self, forKey: .messages) ?? []
        openLoops = try values.decodeIfPresent([OpenLoop].self, forKey: .openLoops) ?? []
        actions = try values.decodeIfPresent([ActionProposal].self, forKey: .actions) ?? []
        audit = try values.decodeIfPresent([AuditRecord].self, forKey: .audit) ?? []
        modelUsage = try values.decodeIfPresent([ModelUsageRecord].self, forKey: .modelUsage) ?? []
        connections = try values.decodeIfPresent([SpecialistConnection].self, forKey: .connections) ?? []
        settings = try values.decodeIfPresent(TrustSettings.self, forKey: .settings) ?? .init()
        lastSurface = try values.decodeIfPresent(MondaySurface.self, forKey: .lastSurface) ?? .mac
        lastUpdated = try values.decodeIfPresent(Date.self, forKey: .lastUpdated) ?? .now
    }
}
