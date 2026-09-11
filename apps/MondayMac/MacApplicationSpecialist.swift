import AppKit
import Foundation
import MONDAYCore

/// Opens only allowlisted specialist applications that Launch Services can
/// resolve to a real bundle on disk. Every launch is proposed, approved once,
/// and verified from the running-process registry.
actor MacApplicationSpecialist: MondaySpecialist {
    private struct KnownApplication: Sendable {
        let name: String
        let bundleIdentifier: String
        let fallbackPath: String
    }

    private let applications = [
        "FORGE": KnownApplication(name: "FORGE", bundleIdentifier: "com.binion.forge", fallbackPath: "/Applications/FORGE.app"),
        "Midas": KnownApplication(name: "Midas", bundleIdentifier: "com.chris.midas.mac", fallbackPath: "/Applications/Midas.app"),
        "Ghostwritr": KnownApplication(name: "Ghostwritr", bundleIdentifier: "com.binion.ghostwritr", fallbackPath: "/Applications/Ghostwritr.app")
    ]

    var descriptor: CapabilityDescriptor {
        get async {
            CapabilityDescriptor(
                id: "mac.application-launch",
                name: "Mac Apps",
                owner: "macOS Launch Services",
                summary: "Opens an installed, allowlisted specialist app only after approval.",
                appleTechnology: "NSWorkspace and NSRunningApplication",
                health: .available,
                statusDetail: "Installed bundles are checked before every proposal",
                supportedSurfaces: [.mac],
                actions: ["open specialist app"],
                verificationMethod: "Read the running application back by bundle identifier"
            )
        }
    }

    func canHandle(_ request: SpecialistRequest) -> Bool {
        MondayRequestRouting.requestedApplicationName(request.text) != nil
    }

    func respond(to request: SpecialistRequest) async throws -> SpecialistResponse {
        guard let requestedName = MondayRequestRouting.requestedApplicationName(request.text),
              let application = applications[requestedName] else {
            throw SpecialistError.invalidProposal("That application is not in MONDAY’s launch allowlist.")
        }
        guard let applicationURL = await resolvedURL(for: application) else {
            return SpecialistResponse(
                narrative: "I checked macOS before making a promise: \(application.name) is not currently installed as a launchable app on this Mac. I have not opened CurseForge, a stale development build, or anything else in its place.",
                evidence: [
                    Evidence(
                        kind: .observed,
                        source: "macOS Launch Services",
                        claim: "No application bundle exists for \(application.bundleIdentifier).",
                        confidence: .verified
                    )
                ]
            )
        }

        let proposal = ActionProposal(
            capabilityID: "mac.application-launch",
            title: "Open \(application.name)",
            explanation: "Open the verified app at \(applicationURL.path). Nothing opens until you approve.",
            consequence: .low,
            parameters: [
                "name": application.name,
                "bundleIdentifier": application.bundleIdentifier,
                "path": applicationURL.path
            ],
            reversible: true
        )
        return SpecialistResponse(
            narrative: "\(application.name) is installed and ready. I’ve prepared the launch below; nothing has opened yet.",
            evidence: [
                Evidence(kind: .observed, source: "macOS Launch Services", claim: "Resolved \(application.bundleIdentifier) to \(applicationURL.path).", confidence: .verified)
            ],
            proposal: proposal
        )
    }

    func execute(_ proposal: ActionProposal) async throws -> ExecutionResult {
        guard proposal.capabilityID == "mac.application-launch",
              let name = proposal.parameters["name"],
              let application = applications[name],
              proposal.parameters["bundleIdentifier"] == application.bundleIdentifier,
              let applicationURL = await resolvedURL(for: application) else {
            throw SpecialistError.invalidProposal("The application launch no longer matches a verified installed bundle.")
        }

        let runningApplication = try await NSWorkspace.shared.openApplication(
            at: applicationURL,
            configuration: NSWorkspace.OpenConfiguration()
        )
        guard runningApplication.bundleIdentifier == application.bundleIdentifier,
              !runningApplication.isTerminated else {
            return ExecutionResult(
                succeeded: false,
                attempted: "macOS accepted the open request, but MONDAY could not verify the expected process.",
                verification: nil,
                evidence: [Evidence(kind: .attempted, source: "macOS Launch Services", claim: "Launch issued without matching process verification.", confidence: .verified)]
            )
        }

        let verification = "macOS is running \(application.name) as process \(runningApplication.processIdentifier) from \(applicationURL.path)."
        return ExecutionResult(
            succeeded: true,
            attempted: "Opened \(application.name).",
            verification: verification,
            evidence: [Evidence(kind: .verified, source: "NSRunningApplication", claim: verification, confidence: .verified)]
        )
    }

    private func resolvedURL(for application: KnownApplication) async -> URL? {
        await MainActor.run {
            let fileManager = FileManager.default
            if let launchServicesURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: application.bundleIdentifier),
               fileManager.fileExists(atPath: launchServicesURL.path) {
                return launchServicesURL
            }
            guard fileManager.fileExists(atPath: application.fallbackPath) else { return nil }
            return URL(fileURLWithPath: application.fallbackPath, isDirectory: true)
        }
    }
}
