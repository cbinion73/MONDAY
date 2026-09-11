import Foundation
import SwiftUI

struct MondayMacPlannerView: View {
    @StateObject private var feed = MacDailyPlannerFeed()

    var body: some View {
        MondayPlannerPageView(plan: feed.plan, statusMessage: feed.message)
            .task { await feed.refresh() }
    }
}

@MainActor
private final class MacDailyPlannerFeed: ObservableObject {
    @Published private(set) var plan: PlannerPageData?
    @Published private(set) var message = "Reading today's MONDAY plan…"

    private let planURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/monday-planner/daily-plan.json")

    func refresh() async {
        do {
            let data = try Data(contentsOf: planURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(PlannerPageData.self, from: data)
            plan = decoded
            message = "Prepared \(decoded.generatedAt.formatted(.dateTime.hour().minute()))."
        } catch {
            plan = nil
            message = "Today's MONDAY plan is not prepared on this Mac yet."
        }
    }
}
