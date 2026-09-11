import Foundation

public struct SpecialistRequest: Sendable {
    public let text: String
    public let surface: MondaySurface
    public let workspace: MondayWorkspace
    public let now: Date

    public init(text: String, surface: MondaySurface, workspace: MondayWorkspace, now: Date = .now) {
        self.text = text
        self.surface = surface
        self.workspace = workspace
        self.now = now
    }
}

public struct SpecialistResponse: Sendable {
    public let narrative: String
    public let evidence: [Evidence]
    public let proposal: ActionProposal?
    public let openLoop: OpenLoop?
    public let modelUsage: ModelUsageRecord?

    public init(
        narrative: String,
        evidence: [Evidence] = [],
        proposal: ActionProposal? = nil,
        openLoop: OpenLoop? = nil,
        modelUsage: ModelUsageRecord? = nil
    ) {
        self.narrative = narrative
        self.evidence = evidence
        self.proposal = proposal
        self.openLoop = openLoop
        self.modelUsage = modelUsage
    }
}

public struct ExecutionResult: Sendable {
    public let succeeded: Bool
    public let attempted: String
    public let verification: String?
    public let evidence: [Evidence]

    public init(succeeded: Bool, attempted: String, verification: String?, evidence: [Evidence] = []) {
        self.succeeded = succeeded
        self.attempted = attempted
        self.verification = verification
        self.evidence = evidence
    }
}

public protocol MondaySpecialist: Sendable {
    var descriptor: CapabilityDescriptor { get async }
    func canHandle(_ request: SpecialistRequest) async -> Bool
    func respond(to request: SpecialistRequest) async throws -> SpecialistResponse
    func execute(_ proposal: ActionProposal) async throws -> ExecutionResult
}

public enum SpecialistError: LocalizedError, Sendable {
    case permissionRequired(String)
    case unavailable(String)
    case invalidProposal(String)

    public var errorDescription: String? {
        switch self {
        case .permissionRequired(let detail): detail
        case .unavailable(let detail): detail
        case .invalidProposal(let detail): detail
        }
    }
}
