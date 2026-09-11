import Foundation

public enum ExternalModelApprovalMode: String, Codable, Sendable {
    case everyRequest
}

public struct ExternalModelPolicy: Codable, Equatable, Sendable {
    public var approvalMode: ExternalModelApprovalMode
    public var automaticMonthlyBudgetCents: Int
    public var automaticRequestClasses: Set<String>
    public var allowedModelIDs: Set<String>
    public var proAndMaxModesEnabled: Bool

    public init(
        approvalMode: ExternalModelApprovalMode = .everyRequest,
        automaticMonthlyBudgetCents: Int = 0,
        automaticRequestClasses: Set<String> = [],
        allowedModelIDs: Set<String> = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
        proAndMaxModesEnabled: Bool = false
    ) {
        self.approvalMode = approvalMode
        self.automaticMonthlyBudgetCents = max(0, automaticMonthlyBudgetCents)
        self.automaticRequestClasses = automaticRequestClasses
        self.allowedModelIDs = allowedModelIDs
        self.proAndMaxModesEnabled = proAndMaxModesEnabled
    }

    public static let zeroSpend = ExternalModelPolicy()
}

public struct ExternalModelRequest: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let provider: String
    public let modelID: String
    public let requestClass: String
    public let purpose: String
    public let contextDisclosure: String
    public let maximumInputTokens: Int
    public let maximumOutputTokens: Int
    public let maximumEstimatedCostCents: Int
    public let isAutomatic: Bool

    public init(
        id: UUID = UUID(),
        provider: String = "OpenAI",
        modelID: String,
        requestClass: String,
        purpose: String,
        contextDisclosure: String,
        maximumInputTokens: Int,
        maximumOutputTokens: Int,
        maximumEstimatedCostCents: Int,
        isAutomatic: Bool = false
    ) {
        self.id = id
        self.provider = provider
        self.modelID = modelID
        self.requestClass = requestClass
        self.purpose = purpose
        self.contextDisclosure = contextDisclosure
        self.maximumInputTokens = maximumInputTokens
        self.maximumOutputTokens = maximumOutputTokens
        self.maximumEstimatedCostCents = max(0, maximumEstimatedCostCents)
        self.isAutomatic = isAutomatic
    }
}

public struct ExternalModelRequestPreview: Codable, Equatable, Identifiable, Sendable {
    public var id: UUID { request.id }
    public let request: ExternalModelRequest
    public let createdAt: Date
    public let expiresAt: Date
}

public struct ExternalModelApprovalReceipt: Codable, Equatable, Sendable {
    public let requestID: UUID
    public let approvedRequest: ExternalModelRequest
    public let approvingSurface: MondaySurface
    public let approvedAt: Date
    public let expiresAt: Date
}

public struct ExternalModelAuthorization: Equatable, Sendable {
    public let requestID: UUID
    public let provider: String
    public let modelID: String
    public let maximumInputTokens: Int
    public let maximumOutputTokens: Int
    public let maximumEstimatedCostCents: Int
}

public enum ExternalModelPolicyError: Error, Equatable, LocalizedError {
    case automaticSpendDisabled
    case automaticClassNotAuthorized
    case modelNotAuthorized
    case elevatedModeNotAuthorized
    case invalidTokenCeiling
    case previewMissingOrExpired
    case approvalRequired
    case approvalDoesNotMatch
    case approvalAlreadyConsumed

    public var errorDescription: String? {
        switch self {
        case .automaticSpendDisabled: "Automatic external-model spending is disabled ($0 budget)."
        case .automaticClassNotAuthorized: "This automatic request class is not authorized."
        case .modelNotAuthorized: "This external model is not on the approved model list."
        case .elevatedModeNotAuthorized: "Pro and max modes require a separate policy decision."
        case .invalidTokenCeiling: "The request must disclose positive input and output token ceilings."
        case .previewMissingOrExpired: "The request preview is missing or has expired."
        case .approvalRequired: "This external-model request requires manual approval."
        case .approvalDoesNotMatch: "The approval does not match this exact request."
        case .approvalAlreadyConsumed: "This one-time approval has already been consumed."
        }
    }
}

public actor ExternalModelApprovalGate {
    private var policy: ExternalModelPolicy
    private var previews: [UUID: ExternalModelRequestPreview] = [:]
    private var approvals: [UUID: ExternalModelApprovalReceipt] = [:]
    private var consumedRequestIDs: Set<UUID> = []
    private var automaticSpendCents = 0

    public init(policy: ExternalModelPolicy = .zeroSpend) {
        self.policy = policy
    }

    public func propose(_ request: ExternalModelRequest, now: Date = .now, lifetime: TimeInterval = 300) throws -> ExternalModelRequestPreview {
        try validateShape(request)
        let preview = ExternalModelRequestPreview(request: request, createdAt: now, expiresAt: now.addingTimeInterval(lifetime))
        previews[request.id] = preview
        return preview
    }

    public func approve(requestID: UUID, from surface: MondaySurface, now: Date = .now) throws -> ExternalModelApprovalReceipt {
        guard let preview = previews[requestID], preview.expiresAt >= now else {
            throw ExternalModelPolicyError.previewMissingOrExpired
        }
        let receipt = ExternalModelApprovalReceipt(
            requestID: requestID,
            approvedRequest: preview.request,
            approvingSurface: surface,
            approvedAt: now,
            expiresAt: preview.expiresAt
        )
        approvals[requestID] = receipt
        return receipt
    }

    public func authorize(_ request: ExternalModelRequest, receipt: ExternalModelApprovalReceipt? = nil, now: Date = .now) throws -> ExternalModelAuthorization {
        try validateShape(request)

        if request.isAutomatic {
            guard policy.automaticMonthlyBudgetCents > 0 else { throw ExternalModelPolicyError.automaticSpendDisabled }
            guard policy.automaticRequestClasses.contains(request.requestClass) else { throw ExternalModelPolicyError.automaticClassNotAuthorized }
            guard automaticSpendCents + request.maximumEstimatedCostCents <= policy.automaticMonthlyBudgetCents else {
                throw ExternalModelPolicyError.automaticSpendDisabled
            }
            automaticSpendCents += request.maximumEstimatedCostCents
            return authorization(for: request)
        }

        guard !consumedRequestIDs.contains(request.id) else { throw ExternalModelPolicyError.approvalAlreadyConsumed }
        guard let receipt, let stored = approvals[request.id] else { throw ExternalModelPolicyError.approvalRequired }
        guard receipt == stored, receipt.expiresAt >= now, receipt.approvedRequest == request else {
            throw ExternalModelPolicyError.approvalDoesNotMatch
        }
        approvals.removeValue(forKey: request.id)
        previews.removeValue(forKey: request.id)
        consumedRequestIDs.insert(request.id)
        return authorization(for: request)
    }

    private func validateShape(_ request: ExternalModelRequest) throws {
        guard policy.allowedModelIDs.contains(request.modelID) else { throw ExternalModelPolicyError.modelNotAuthorized }
        let lowered = request.modelID.lowercased()
        if !policy.proAndMaxModesEnabled && (lowered.contains("pro") || lowered.contains("max")) {
            throw ExternalModelPolicyError.elevatedModeNotAuthorized
        }
        guard request.maximumInputTokens > 0, request.maximumOutputTokens > 0 else {
            throw ExternalModelPolicyError.invalidTokenCeiling
        }
    }

    private func authorization(for request: ExternalModelRequest) -> ExternalModelAuthorization {
        ExternalModelAuthorization(
            requestID: request.id,
            provider: request.provider,
            modelID: request.modelID,
            maximumInputTokens: request.maximumInputTokens,
            maximumOutputTokens: request.maximumOutputTokens,
            maximumEstimatedCostCents: request.maximumEstimatedCostCents
        )
    }
}
