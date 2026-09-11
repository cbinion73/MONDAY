import Foundation

public enum MondaySiriCapability: String, Codable, CaseIterable, Sendable {
    case discoverContext
    case captureKnowledge
    case recordCommitment
    case reviewPriorities
    case assessCapacity
    case proposeAction
    case executeAction
}

public enum MondaySiriAuthority: String, Codable, Equatable, Sendable {
    case readOnly
    case directCapture
    case proposalOnly
    case prohibited
}

public struct MondaySiriRoutingPolicy: Equatable, Sendable {
    public init() {}

    public func authority(for capability: MondaySiriCapability) -> MondaySiriAuthority {
        switch capability {
        case .discoverContext, .reviewPriorities, .assessCapacity:
            .readOnly
        case .captureKnowledge, .recordCommitment:
            .directCapture
        case .proposeAction:
            .proposalOnly
        case .executeAction:
            .prohibited
        }
    }

    public func permitsBackgroundExecution(of capability: MondaySiriCapability) -> Bool {
        let authority = authority(for: capability)
        return authority == .readOnly || authority == .directCapture
    }
}

public struct MondayCapacityAssessment: Equatable, Sendable {
    public let headline: String
    public let detail: String
    public let pressure: Int

    public init(headline: String, detail: String, pressure: Int) {
        self.headline = headline
        self.detail = detail
        self.pressure = pressure
    }
}

public enum MondayCapacityPolicy {
    public static func assess(initiative: String, workspace: MondayWorkspace) -> MondayCapacityAssessment {
        let active = workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
        let approvals = workspace.actions.filter { $0.status == .proposed }
        let blocked = active.filter { $0.status == .blocked }.count
        let pressure = min(100, active.count * 11 + approvals.count * 18 + blocked * 9)

        if pressure >= 75 {
            return MondayCapacityAssessment(
                headline: "Not yet",
                detail: "\(initiative) may be worthwhile, but your current load is already doing its best impression of a packed suitcase. Close or pause something first.",
                pressure: pressure
            )
        }
        if pressure >= 40 {
            return MondayCapacityAssessment(
                headline: "Possible with a tradeoff",
                detail: "You can take on \(initiative), but not invisibly. Choose one current commitment to defer and give this a defined trial window.",
                pressure: pressure
            )
        }
        return MondayCapacityAssessment(
            headline: "There is room",
            detail: "Your current commitment load leaves space to explore \(initiative). I would still start with a small, reversible next step—enthusiasm is lovely; evidence is lovelier.",
            pressure: pressure
        )
    }
}
