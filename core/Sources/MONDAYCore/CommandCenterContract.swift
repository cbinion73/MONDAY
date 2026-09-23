import Foundation

/// Versioned, read-only projection produced by the MONDAY plugin and consumed by the native apps.
/// Vaults and ledgers remain authoritative. This payload is only a current cockpit view.
public struct CommandCenterPlan: Codable, Sendable {
    public let schemaVersion: Int?
    public let planID: String?
    public let date: String
    public let generatedAt: Date
    public let validUntil: Date?
    public let timezone: String
    public let sources: [CommandCenterSource]
    public let coverage: CommandCenterCoverage?
    public let primaryFocus: String
    public let schedule: [CommandCenterScheduleItem]
    public let priorities: CommandCenterPriorities
    public let notes: [String]
    public let compass: [CommandCenterCompassItem]
    public let brief: CommandCenterBrief?
    public let publication: CommandCenterPublication?

    public init(
        schemaVersion: Int? = nil,
        planID: String? = nil,
        date: String,
        generatedAt: Date,
        validUntil: Date? = nil,
        timezone: String,
        sources: [CommandCenterSource],
        coverage: CommandCenterCoverage? = nil,
        primaryFocus: String,
        schedule: [CommandCenterScheduleItem],
        priorities: CommandCenterPriorities,
        notes: [String],
        compass: [CommandCenterCompassItem],
        brief: CommandCenterBrief? = nil,
        publication: CommandCenterPublication? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.planID = planID
        self.date = date
        self.generatedAt = generatedAt
        self.validUntil = validUntil
        self.timezone = timezone
        self.sources = sources
        self.coverage = coverage
        self.primaryFocus = primaryFocus
        self.schedule = schedule
        self.priorities = priorities
        self.notes = notes
        self.compass = compass
        self.brief = brief
        self.publication = publication
    }

    public func validation(now: Date = .now, calendar: Calendar = .autoupdatingCurrent) -> CommandCenterPlanValidation {
        if let schemaVersion, schemaVersion > 3 {
            return .unsupportedSchema(schemaVersion)
        }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let expectedDate = formatter.string(from: now)
        guard date == expectedDate else { return .wrongDate(expected: expectedDate, actual: date) }
        if let validUntil, validUntil <= now { return .expired(validUntil) }
        if schemaVersion == 3, planID?.isEmpty != false { return .missingPlanIdentifier }
        return .current
    }

    public func readback(consumer: String, appVersion: String, consumedAt: Date = .now) -> CommandCenterReadback? {
        guard let planID, !planID.isEmpty, let schemaVersion else { return nil }
        return CommandCenterReadback(
            schemaVersion: 1,
            planID: planID,
            planSchemaVersion: schemaVersion,
            consumer: consumer,
            appVersion: appVersion,
            consumedAt: consumedAt,
            state: "displayed"
        )
    }
}

public enum CommandCenterPlanValidation: Equatable, Sendable {
    case current
    case unsupportedSchema(Int)
    case wrongDate(expected: String, actual: String)
    case expired(Date)
    case missingPlanIdentifier
}

public struct CommandCenterSource: Codable, Identifiable, Sendable {
    public var id: String { "\(kind):\(name)" }
    public let kind: String
    public let name: String
    public let status: String
    public let fetchedAt: Date
    public let attemptedAt: Date?
    public let succeededAt: Date?
    public let itemCount: Int?
    public let processedCount: Int?
    public let unresolvedCount: Int?
    public let detail: String?
    public let error: String?

    public init(
        kind: String,
        name: String,
        status: String,
        fetchedAt: Date,
        attemptedAt: Date? = nil,
        succeededAt: Date? = nil,
        itemCount: Int? = nil,
        processedCount: Int? = nil,
        unresolvedCount: Int? = nil,
        detail: String? = nil,
        error: String? = nil
    ) {
        self.kind = kind
        self.name = name
        self.status = status
        self.fetchedAt = fetchedAt
        self.attemptedAt = attemptedAt
        self.succeededAt = succeededAt
        self.itemCount = itemCount
        self.processedCount = processedCount
        self.unresolvedCount = unresolvedCount
        self.detail = detail
        self.error = error
    }
}

public struct CommandCenterCoverage: Codable, Sendable {
    public let status: String
    public let sources: [CommandCenterSource]
    public let unresolved: [String]
}

public struct CommandCenterScheduleItem: Codable, Sendable {
    public let time: String
    public let end: String
    public let title: String

    public init(time: String, end: String, title: String) {
        self.time = time
        self.end = end
        self.title = title
    }
}

public struct CommandCenterPriorities: Codable, Sendable {
    public let a: [String]
    public let b: [String]
    public let c: [String]

    public init(a: [String], b: [String], c: [String]) {
        self.a = a
        self.b = b
        self.c = c
    }
}

public struct CommandCenterCompassItem: Codable, Sendable {
    public let role: String
    public let goal: String

    public init(role: String, goal: String) {
        self.role = role
        self.goal = goal
    }
}

public struct CommandCenterProjectSummary: Codable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let status: String
    public let outcome: String
    public let nextAction: String
    public let owner: String
    public let updated: String
    public let reviewDate: String
    public let evidenceStatus: String
    public let path: String
}

public struct CommandCenterMeetingContinuity: Codable, Sendable {
    public let ledger: String
    public let occurrenceCount: Int
    public let unresolvedCount: Int
    public let byStatus: [String: Int]
}

public struct CommandCenterActivitySummary: Codable, Sendable {
    public let path: String
    public let recordCount: Int
}

public struct CommandCenterOperationsSummary: Codable, Sendable {
    public let path: String
    public let receiptCount: Int
}

public struct CommandCenterBrief: Codable, Sendable {
    public let mission: String
    public let pullForwards: [String]
    public let risks: [String]
    public let workPortfolio: [CommandCenterProjectSummary]
    public let personalPortfolio: [CommandCenterProjectSummary]
    public let decisions: [CommandCenterProjectSummary]
    public let meetingContinuity: CommandCenterMeetingContinuity
    public let activityLedger: CommandCenterActivitySummary
    public let operations: CommandCenterOperationsSummary
    public let sourceHealth: [CommandCenterSource]
}

public struct CommandCenterPublication: Codable, Sendable {
    public let producer: String
    public let contractVersion: Int
    public let state: String
}

public struct CommandCenterReadback: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let planID: String
    public let planSchemaVersion: Int
    public let consumer: String
    public let appVersion: String
    public let consumedAt: Date
    public let state: String

    public init(
        schemaVersion: Int,
        planID: String,
        planSchemaVersion: Int,
        consumer: String,
        appVersion: String,
        consumedAt: Date,
        state: String
    ) {
        self.schemaVersion = schemaVersion
        self.planID = planID
        self.planSchemaVersion = planSchemaVersion
        self.consumer = consumer
        self.appVersion = appVersion
        self.consumedAt = consumedAt
        self.state = state
    }
}
