import Foundation
import MONDAYCore
import SwiftUI

struct MondayMacPlannerView: View {
    @StateObject private var feed = MacDailyPlannerFeed()

    var body: some View {
        MondayPlannerPageView(plan: feed.plan, statusMessage: feed.message)
            .task {
                await feed.refresh()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(60))
                    guard !Task.isCancelled else { return }
                    await feed.refresh()
                }
            }
    }
}

@MainActor
private final class MacDailyPlannerFeed: ObservableObject {
    @Published private(set) var plan: PlannerPageData?
    @Published private(set) var message = "Reading today's MONDAY plan…"

    private let planURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/monday-planner/daily-plan.json")
    private let readbackURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/monday-planner/readback.json")

    func refresh() async {
        do {
            let data = try Data(contentsOf: planURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(PlannerPageData.self, from: data)
            switch decoded.validation() {
            case .current:
                break
            case .unsupportedSchema(let schema):
                throw PlannerFeedError.unsupportedSchema(schema)
            case .wrongDate(let expected, let actual):
                throw PlannerFeedError.wrongDate(expected: expected, actual: actual)
            case .expired:
                throw PlannerFeedError.expired
            case .missingPlanIdentifier:
                throw PlannerFeedError.missingPlanIdentifier
            }
            plan = decoded
            if let readback = decoded.readback(
                consumer: "MONDAY macOS",
                appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
            ) {
                try writeReadback(readback)
                message = "Prepared \(decoded.generatedAt.formatted(.dateTime.hour().minute())). Display verified."
            } else {
                message = "Prepared \(decoded.generatedAt.formatted(.dateTime.hour().minute())). Legacy plan, display not verified."
            }
        } catch {
            plan = nil
            message = (error as? LocalizedError)?.errorDescription
                ?? "Today's MONDAY plan is not prepared on this Mac yet."
        }
    }

    private func writeReadback(_ readback: CommandCenterReadback) throws {
        try FileManager.default.createDirectory(
            at: readbackURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(readback).write(to: readbackURL, options: [.atomic])
    }
}

private enum PlannerFeedError: LocalizedError {
    case unsupportedSchema(Int)
    case wrongDate(expected: String, actual: String)
    case expired
    case missingPlanIdentifier

    var errorDescription: String? {
        switch self {
        case .unsupportedSchema(let schema):
            "The plan uses unsupported schema version \(schema). Update MONDAY before displaying it."
        case .wrongDate(let expected, let actual):
            "The available plan is for \(actual), not today (\(expected)). Rebuild today's plan."
        case .expired:
            "Today's plan has expired. Rebuild it before relying on the Command Center."
        case .missingPlanIdentifier:
            "The plan is missing its verification identifier and was not displayed."
        }
    }
}
