import Foundation
import MONDAYCore

/// An explicit boundary is safer than allowing a language model to infer access
/// to accounts that MONDAY has not connected and authorized.
actor EmailCapabilityBoundarySpecialist: MondaySpecialist {
    var descriptor: CapabilityDescriptor {
        get async {
            CapabilityDescriptor(
                id: "apple.mail",
                name: "Email",
                owner: "Apple Mail",
                summary: "Email access remains unavailable until a real account connection and read policy are configured.",
                appleTechnology: "No authorized Mail integration",
                health: .unavailable,
                statusDetail: "No email account is connected",
                supportedSurfaces: [.mac, .iPhone, .iPad],
                actions: ["read inbox", "summarize email"],
                verificationMethod: "Message identifiers and account source must be read back from an authorized email specialist"
            )
        }
    }

    func canHandle(_ request: SpecialistRequest) -> Bool {
        MondayRequestRouting.isEmailRequest(request.text)
    }

    func respond(to request: SpecialistRequest) async throws -> SpecialistResponse {
        SpecialistResponse(
            narrative: "Not yet. I don’t have an authorized email connection, so I cannot read any part of your inbox—not even three lines. I haven’t accessed Mail or invented a substitute.",
            evidence: [
                Evidence(
                    kind: .observed,
                    source: "MONDAY capability registry",
                    claim: "No authorized email specialist or account connection is registered.",
                    confidence: .verified
                )
            ]
        )
    }

    func execute(_ proposal: ActionProposal) async throws -> ExecutionResult {
        throw SpecialistError.unavailable("Email access is not configured.")
    }
}
