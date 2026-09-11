import Foundation
import SQLite3
import SwiftUI

private enum CommandCenterTab: String, CaseIterable, Identifiable {
    case portfolio = "Portfolio"
    case researchJournal = "Research Journal"
    var id: String { rawValue }
}

/// A read-only visual projection of the governed MONDAY project registry.
/// The dashboard never invents progress: unknown evidence, dates, and hours remain unknown.
struct CommandCenterView: View {
    @StateObject private var store = CommandCenterStore()
    @State private var selectedProject: CommandCenterProject?
    @State private var tab: CommandCenterTab = .portfolio

    var body: some View {
        ZStack {
            CommandCenterDesign.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Picker("Command Center", selection: $tab) {
                    ForEach(CommandCenterTab.allCases) { tab in
                        Label(tab.rawValue, systemImage: tab == .portfolio ? "rectangle.3.group.fill" : "text.book.closed.fill").tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 30)
                .padding(.top, 22)

                if tab == .portfolio {
                    portfolioContent
                } else {
                    ResearchJournalView()
                }
            }
        }
        .preferredColorScheme(.light)
        .task { await store.refresh() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                guard !Task.isCancelled else { return }
                await store.refresh()
            }
        }
        .sheet(item: $selectedProject) { project in
            ProjectDetailView(project: project)
                .frame(width: 620, height: 560)
        }
    }

    private var portfolioContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header

                if let error = store.errorMessage {
                    unavailableState(error)
                } else {
                    metricStrip
                    timeline
                    portfolioGrid
                }
            }
            .padding(30)
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 9) {
                    Image(systemName: "rectangle.3.group.fill")
                        .foregroundStyle(MondayDesign.mint)
                    Text("MONDAY COMMAND CENTER")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .tracking(1.4)
                        .foregroundStyle(MondayDesign.mint)
                }
                Text("The work that is actually moving.")
                    .font(.system(size: 30, weight: .medium, design: .rounded))
                Text("Visual portfolio, real gates, and evidence-backed status from the governed project registry.")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 10) {
                Button {
                    Task { await store.refresh() }
                } label: {
                    Label(store.isRefreshing ? "Refreshing…" : "Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(store.isRefreshing)

                Text(store.freshnessLabel)
                    .font(.system(size: 10, design: .rounded))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }
        }
    }

    private var metricStrip: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 190), spacing: 14)], spacing: 14) {
            MetricCard(
                label: "Active portfolio",
                value: "\(store.activeProjects.count)",
                detail: "projects currently in motion",
                color: MondayDesign.blue,
                icon: "circle.grid.2x2.fill"
            )
            MetricCard(
                label: "Needs attention",
                value: "\(store.attentionProjects.count)",
                detail: "at risk, blocked, or intervention",
                color: MondayDesign.rose,
                icon: "exclamationmark.triangle.fill"
            )
            MetricCard(
                label: "Gates ahead",
                value: "\(store.upcomingGates.count)",
                detail: "dated gates in the next 90 days",
                color: MondayDesign.amber,
                icon: "flag.checkered"
            )
            MetricCard(
                label: "Six-month capacity",
                value: store.capacityLabel,
                detail: store.capacityDetail,
                color: MondayDesign.mint,
                icon: "chart.bar.xaxis"
            )
        }
    }

    private var timeline: some View {
        CommandCenterCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Next 90 Days")
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                        Text("Only actual dated gates appear here. Undated work stays off the timeline.")
                            .font(.system(size: 11, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    StatusPill(label: "\(store.upcomingGates.count) dated gates", color: MondayDesign.amber, icon: "calendar")
                }

                if store.upcomingGates.isEmpty {
                    EmptyVisual(label: "No dated project gates in the next 90 days.", icon: "calendar.badge.exclamationmark")
                } else {
                    GateTimeline(gates: store.upcomingGates)
                        .frame(height: 178)
                }
            }
        }
    }

    private var portfolioGrid: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Portfolio")
                        .font(.system(size: 18, weight: .semibold, design: .rounded))
                    Text("Health, stage, and next milestone — no simulated completion percentage.")
                        .font(.system(size: 11, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                StatusPill(label: "\(store.projects.count) records", color: MondayDesign.violet, icon: "circle.stack.fill")
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 285), spacing: 14)], spacing: 14) {
                ForEach(store.projects) { project in
                    ProjectCard(project: project) {
                        selectedProject = project
                    }
                }
            }
        }
    }

    private func unavailableState(_ error: String) -> some View {
        CommandCenterCard {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: "externaldrive.badge.exclamationmark")
                    .font(.system(size: 30))
                    .foregroundStyle(MondayDesign.amber)
                Text("Project registry unavailable")
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                Text(error)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
                Text("No fallback data is shown. The Command Center only displays the governed project registry.")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
        }
    }
}

private struct ResearchJournalView: View {
    @State private var content = ""
    @State private var errorMessage: String?
    private let sourceURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Knowledge Vault/Monday Vault/Diary/BUILD-CHRONICLE-2026-05-to-2026-09.md")

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("MONDAY RESEARCH JOURNAL", systemImage: "text.book.closed.fill")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .tracking(1.2)
                            .foregroundStyle(MondayDesign.mint)
                        Text("What we built, why we built it, and what the work taught us.")
                            .font(.system(size: 26, weight: .medium, design: .rounded))
                    }
                    Spacer()
                    Text("READ ONLY · GOVERNED VAULT")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                if let errorMessage {
                    CommandCenterCard {
                        Text(errorMessage).foregroundStyle(.secondary)
                    }
                } else {
                    Text(content)
                        .font(.system(size: 15, design: .serif))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(22)
                        .background(CommandCenterDesign.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
            }
            .padding(30)
        }
        .task {
            do {
                content = try String(contentsOf: sourceURL, encoding: .utf8)
                errorMessage = nil
            } catch {
                errorMessage = "The governed Research Journal could not be read from the MONDAY Vault. No fallback journal is shown."
            }
        }
    }
}

@MainActor
private final class CommandCenterStore: ObservableObject {
    @Published private(set) var projects: [CommandCenterProject] = []
    @Published private(set) var loadedAt: Date?
    @Published private(set) var errorMessage: String?
    @Published private(set) var isRefreshing = false

    var activeProjects: [CommandCenterProject] {
        projects.filter { $0.status == "active" }
    }

    var attentionProjects: [CommandCenterProject] {
        activeProjects.filter { $0.needsAttention }
    }

    var upcomingGates: [CommandCenterProject] {
        let now = Calendar.current.startOfDay(for: .now)
        let horizon = Calendar.current.date(byAdding: .day, value: 90, to: now) ?? now
        return activeProjects
            .filter { project in
                guard let date = project.gateDate else { return false }
                return date >= now && date <= horizon
            }
            .sorted { ($0.gateDate ?? .distantFuture) < ($1.gateDate ?? .distantFuture) }
    }

    var capacityLabel: String {
        let planned = activeProjects.compactMap(\.plannedHours).reduce(0, +)
        let actual = activeProjects.compactMap(\.actualHours).reduce(0, +)
        guard planned > 0 || actual > 0 else { return "Unknown" }
        return "\(Int(actual)) / \(Int(planned)) h"
    }

    var capacityDetail: String {
        let plannedKnown = activeProjects.contains { $0.plannedHours != nil }
        let actualKnown = activeProjects.contains { $0.actualHours != nil }
        if !plannedKnown { return "planned hours not yet recorded" }
        if !actualKnown { return "actual hours not yet recorded" }
        return "actual / planned active hours"
    }

    var freshnessLabel: String {
        guard let loadedAt else { return "Registry not loaded" }
        let evidence = projects.compactMap(\.updatedAt).max()
        let refresh = loadedAt.formatted(date: .omitted, time: .shortened)
        guard let evidence else { return "Refreshed \(refresh) · no evidence date" }
        return "Refreshed \(refresh) · source updated \(evidence.formatted(date: .abbreviated, time: .shortened))"
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            projects = try ProjectRegistryReader.load()
            loadedAt = .now
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CommandCenterProject: Identifiable, Sendable {
    let id: String
    let title: String
    let status: String
    let health: String
    let priority: Int?
    let domain: String?
    let stage: String?
    let gateState: String?
    let gateDate: Date?
    let nextMilestone: String?
    let nextAction: String?
    let plannedHours: Double?
    let actualHours: Double?
    let tierFocus: String?
    let evidenceAsOf: String?
    let updatedAt: Date?

    var needsAttention: Bool {
        health == "at-risk" || health == "intervention" || gateState?.contains("blocked") == true
    }

    var healthColor: Color {
        switch health {
        case "ready": MondayDesign.mint
        case "watch": MondayDesign.amber
        case "at-risk", "intervention": MondayDesign.rose
        default: Color.secondary
        }
    }

    var healthLabel: String {
        health.replacingOccurrences(of: "-", with: " ")
    }

    var gateLabel: String {
        if let gateDate {
            return gateDate.formatted(.dateTime.month(.abbreviated).day().year())
        }
        return "Undated"
    }
}

private enum ProjectRegistryReader {
    private static let databaseURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Knowledge Vault/monday-memory-mcp/data/projects.sqlite3", isDirectory: false)

    static func load() throws -> [CommandCenterProject] {
        guard FileManager.default.fileExists(atPath: databaseURL.path) else {
            throw CommandCenterError.missingRegistry(databaseURL.path)
        }

        var database: OpaquePointer?
        let openResult = sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil)
        guard openResult == SQLITE_OK else {
            let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown SQLite error"
            if let database { sqlite3_close(database) }
            throw CommandCenterError.database(message)
        }
        defer { sqlite3_close(database) }

        let query = """
        SELECT id, title, status, health, priority, domain, stage, gate_state,
               gate_date, next_milestone, next_action, planned_hours_6m,
               actual_hours_6m, tier_focus, evidence_as_of, updated_at
        FROM projects
        WHERE archived_at IS NULL
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
                 CASE health WHEN 'intervention' THEN 0 WHEN 'at-risk' THEN 1
                 WHEN 'watch' THEN 2 WHEN 'ready' THEN 3 ELSE 4 END,
                 priority ASC, updated_at DESC;
        """

        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, query, -1, &statement, nil) == SQLITE_OK else {
            throw CommandCenterError.database(String(cString: sqlite3_errmsg(database)))
        }
        defer { sqlite3_finalize(statement) }

        var projects: [CommandCenterProject] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            projects.append(
                CommandCenterProject(
                    id: string(statement, column: 0) ?? UUID().uuidString,
                    title: string(statement, column: 1) ?? "Untitled project",
                    status: string(statement, column: 2) ?? "unknown",
                    health: string(statement, column: 3) ?? "unknown",
                    priority: integer(statement, column: 4),
                    domain: string(statement, column: 5),
                    stage: string(statement, column: 6),
                    gateState: string(statement, column: 7),
                    gateDate: date(string(statement, column: 8)),
                    nextMilestone: string(statement, column: 9),
                    nextAction: string(statement, column: 10),
                    plannedHours: decimal(statement, column: 11),
                    actualHours: decimal(statement, column: 12),
                    tierFocus: string(statement, column: 13),
                    evidenceAsOf: string(statement, column: 14),
                    updatedAt: date(string(statement, column: 15))
                )
            )
        }
        return projects
    }

    private static func string(_ statement: OpaquePointer?, column: Int32) -> String? {
        guard sqlite3_column_type(statement, column) != SQLITE_NULL,
              let text = sqlite3_column_text(statement, column) else { return nil }
        return String(cString: text)
    }

    private static func integer(_ statement: OpaquePointer?, column: Int32) -> Int? {
        guard sqlite3_column_type(statement, column) != SQLITE_NULL else { return nil }
        return Int(sqlite3_column_int(statement, column))
    }

    private static func decimal(_ statement: OpaquePointer?, column: Int32) -> Double? {
        guard sqlite3_column_type(statement, column) != SQLITE_NULL else { return nil }
        return sqlite3_column_double(statement, column)
    }

    private static func date(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let fractionalISO8601 = ISO8601DateFormatter()
        fractionalISO8601.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalISO8601.date(from: value) { return date }
        if let date = ISO8601DateFormatter().date(from: value) { return date }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }
}

private enum CommandCenterError: LocalizedError {
    case missingRegistry(String)
    case database(String)

    var errorDescription: String? {
        switch self {
        case .missingRegistry(let path): "The governed project registry was not found at \(path)."
        case .database(let message): "The project registry could not be read: \(message)"
        }
    }
}

private enum CommandCenterDesign {
    static let background = Color.white
    static let card = Color(red: 0.985, green: 0.988, blue: 0.995)
    static let line = Color.black.opacity(0.09)
}

private struct CommandCenterCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(16)
            .background(CommandCenterDesign.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(CommandCenterDesign.line, lineWidth: 0.7))
            .shadow(color: .black.opacity(0.045), radius: 10, y: 3)
    }
}

private struct MetricCard: View {
    let label: String
    let value: String
    let detail: String
    let color: Color
    let icon: String

    var body: some View {
        CommandCenterCard {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(color)
                Text(value)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .tracking(0.9)
                    .foregroundStyle(.secondary)
                Text(detail)
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
            .frame(maxWidth: .infinity, minHeight: 122, alignment: .leading)
        }
    }
}

private struct GateTimeline: View {
    let gates: [CommandCenterProject]

    var body: some View {
        GeometryReader { proxy in
            let start = Calendar.current.startOfDay(for: .now)
            let end = Calendar.current.date(byAdding: .day, value: 90, to: start) ?? start
            let range = max(end.timeIntervalSince(start), 1)

            ZStack(alignment: .topLeading) {
                Capsule()
                    .fill(CommandCenterDesign.line)
                    .frame(height: 3)
                    .padding(.top, 79)

                ForEach(gates) { project in
                    if let date = project.gateDate {
                        let progress = min(max(date.timeIntervalSince(start) / range, 0), 1)
                        let x = max(10, min(proxy.size.width - 12, proxy.size.width * progress))
                        TimelineGate(project: project)
                            .position(x: x, y: 79)
                    }
                }

                HStack {
                    Text(start.formatted(.dateTime.month(.abbreviated).day()))
                    Spacer()
                    Text(end.formatted(.dateTime.month(.abbreviated).day()))
                }
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundStyle(.tertiary)
                .padding(.top, 156)
            }
        }
    }
}

private struct TimelineGate: View {
    let project: CommandCenterProject

    var body: some View {
        VStack(spacing: 6) {
            VStack(spacing: 2) {
                Text(project.gateLabel)
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(project.healthColor)
                Text(project.title)
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: 112)
            }
            Circle()
                .fill(project.healthColor)
                .frame(width: 12, height: 12)
                .overlay(Circle().stroke(.white.opacity(0.85), lineWidth: 2))
                .shadow(color: project.healthColor.opacity(0.6), radius: 6)
            Text(project.gateState?.replacingOccurrences(of: "_", with: " ") ?? "gate")
                .font(.system(size: 8, design: .rounded))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(width: 112)
        }
    }
}

private struct ProjectCard: View {
    let project: CommandCenterProject
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            CommandCenterCard {
                VStack(alignment: .leading, spacing: 13) {
                    HStack(alignment: .top) {
                        StatusPill(label: project.healthLabel, color: project.healthColor, icon: project.needsAttention ? "exclamationmark" : "circle.fill")
                        Spacer()
                        if let priority = project.priority {
                            Text("P\(priority)")
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                    }

                    Text(project.title)
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)

                    if let stage = project.stage, !stage.isEmpty {
                        Label(stage.replacingOccurrences(of: "-", with: " "), systemImage: "circle.dotted")
                            .font(.system(size: 10, design: .rounded))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Rectangle().fill(CommandCenterDesign.line).frame(height: 1)

                    VStack(alignment: .leading, spacing: 5) {
                        Text("NEXT MILESTONE")
                            .font(.system(size: 8, weight: .bold, design: .rounded))
                            .tracking(0.9)
                            .foregroundStyle(.tertiary)
                        Text(project.nextMilestone ?? "Not yet recorded")
                            .font(.system(size: 11, design: .rounded))
                            .foregroundStyle(project.nextMilestone == nil ? .tertiary : .secondary)
                            .lineLimit(2)
                    }

                    HStack {
                        Label(project.gateLabel, systemImage: "calendar")
                        Spacer()
                        if let domain = project.domain, !domain.isEmpty {
                            Text(domain)
                        }
                    }
                    .font(.system(size: 10, design: .rounded))
                    .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 245, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct ProjectDetailView: View {
    let project: CommandCenterProject
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            CommandCenterDesign.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 9) {
                        StatusPill(label: project.healthLabel, color: project.healthColor, icon: "heart.text.square")
                        Text(project.title)
                            .font(.system(size: 27, weight: .medium, design: .rounded))
                    }
                    Spacer()
                    Button("Done") { dismiss() }
                        .buttonStyle(.bordered)
                }

                DetailRow(label: "Stage", value: project.stage?.replacingOccurrences(of: "-", with: " ") ?? "Unknown")
                DetailRow(label: "Gate", value: "\(project.gateState?.replacingOccurrences(of: "_", with: " ") ?? "Not recorded") · \(project.gateLabel)")
                DetailRow(label: "Next milestone", value: project.nextMilestone ?? "Not recorded")
                DetailRow(label: "Next action", value: project.nextAction ?? "Not recorded")
                DetailRow(label: "Evidence updated", value: project.updatedAt?.formatted(date: .abbreviated, time: .shortened) ?? "Unknown")

                if let planned = project.plannedHours ?? project.actualHours {
                    let actual = project.actualHours
                    HStack(spacing: 10) {
                        Image(systemName: "chart.bar.xaxis")
                            .foregroundStyle(MondayDesign.mint)
                        Text(actual == nil ? "\(Int(planned)) planned hours; actual hours unknown" : "\(Int(actual ?? 0)) actual / \(Int(project.plannedHours ?? 0)) planned hours")
                            .font(.system(size: 12, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)
                }

                Spacer()
            }
            .padding(30)
        }
        .preferredColorScheme(.light)
    }
}

private struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(1)
                .foregroundStyle(.tertiary)
            Text(value)
                .font(.system(size: 13, design: .rounded))
                .foregroundStyle(.secondary)
        }
    }
}

private struct EmptyVisual: View {
    let label: String
    let icon: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(.tertiary)
            Text(label)
                .font(.system(size: 12, design: .rounded))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.vertical, 36)
    }
}
