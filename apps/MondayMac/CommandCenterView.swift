import Foundation
import MONDAYCore
import SwiftUI

private enum CommandCenterTab: String, CaseIterable, Identifiable {
    case today = "Today"
    case projects = "Projects"
    case personalProjects = "Personal Projects"
    case meetingContinuity = "Meeting Continuity"
    case activity = "Activity"
    case operations = "Operations"
    case researchChronicle = "Research Chronicle"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .today: "sun.max.fill"
        case .projects: "rectangle.3.group.fill"
        case .personalProjects: "person.crop.rectangle.stack.fill"
        case .meetingContinuity: "person.2.wave.2.fill"
        case .activity: "list.bullet.clipboard.fill"
        case .operations: "gearshape.2.fill"
        case .researchChronicle: "text.book.closed.fill"
        }
    }
}

/// Read-only visual cockpit for the versioned projection prepared by the MONDAY plugin.
/// It never replaces the underlying project vaults, ledgers, or journals.
struct CommandCenterView: View {
    @StateObject private var store = CommandCenterPlanStore()
    @State private var tab: CommandCenterTab = .today

    var body: some View {
        HStack(spacing: 0) {
            navigation.frame(width: 235)
            Rectangle().fill(CommandCenterPalette.line).frame(width: 1)
            content.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(CommandCenterPalette.background.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task {
            await store.refresh()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled else { return }
                await store.refresh()
            }
        }
    }

    private var navigation: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Label("COMMAND CENTER", systemImage: "command.circle.fill")
                    .font(.system(size: 13, weight: .black, design: .rounded))
                    .tracking(1.1)
                    .foregroundStyle(CommandCenterPalette.accent)
                Text("MONDAY's governed cockpit")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 18)

            ForEach(CommandCenterTab.allCases) { item in
                Button { tab = item } label: {
                    HStack(spacing: 11) {
                        Image(systemName: item.icon).frame(width: 18)
                        Text(item.rawValue)
                        Spacer()
                        if tab == item {
                            Circle().fill(CommandCenterPalette.accent).frame(width: 6, height: 6)
                        }
                    }
                    .font(.system(size: 13, weight: tab == item ? .semibold : .regular, design: .rounded))
                    .foregroundStyle(tab == item ? .white : .secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 11)
                    .background(tab == item ? Color.white.opacity(0.075) : .clear, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }

            Spacer()

            VStack(alignment: .leading, spacing: 7) {
                Label(store.statusLabel, systemImage: store.plan == nil ? "exclamationmark.triangle.fill" : "checkmark.shield.fill")
                    .foregroundStyle(store.plan == nil ? CommandCenterPalette.warning : CommandCenterPalette.good)
                if let plan = store.plan {
                    Text(plan.planID ?? "Legacy unverified plan").lineLimit(2)
                }
                Button { Task { await store.refresh() } } label: {
                    Label(store.isRefreshing ? "Refreshing" : "Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(store.isRefreshing)
            }
            .font(.system(size: 10, design: .rounded))
            .foregroundStyle(.secondary)
        }
        .padding(22)
        .background(Color.black.opacity(0.18))
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .today:
            MondayMacPlannerView()
        case .projects:
            ProjectPortfolioPage(
                title: "Projects",
                subtitle: "Professional projects from governed Project Knowledge.",
                projects: store.plan?.brief?.workPortfolio ?? [],
                unavailable: store.unavailableMessage
            )
        case .personalProjects:
            ProjectPortfolioPage(
                title: "Personal Projects",
                subtitle: "Private projects from Personal Project Knowledge. They are not reported to JARVIS.",
                projects: store.plan?.brief?.personalPortfolio ?? [],
                unavailable: store.unavailableMessage
            )
        case .meetingContinuity:
            MeetingContinuityPage(summary: store.plan?.brief?.meetingContinuity, unavailable: store.unavailableMessage)
        case .activity:
            ReceiptPage(
                title: "Activity Ledger",
                subtitle: "Observable, authorized MONDAY and Codex activity. Never a claim of complete daily coverage.",
                records: store.activityRecords,
                count: store.plan?.brief?.activityLedger.recordCount,
                path: store.plan?.brief?.activityLedger.path,
                unavailable: store.unavailableMessage
            )
        case .operations:
            ReceiptPage(
                title: "MONDAY Operations",
                subtitle: "Pipeline receipts, limitations, open questions, and retry paths.",
                records: store.operationRecords,
                count: store.plan?.brief?.operations.receiptCount,
                path: store.plan?.brief?.operations.path,
                unavailable: store.unavailableMessage
            )
        case .researchChronicle:
            ResearchChroniclePage()
        }
    }
}

@MainActor
private final class CommandCenterPlanStore: ObservableObject {
    @Published private(set) var plan: CommandCenterPlan?
    @Published private(set) var activityRecords: [ReceiptDisplayRecord] = []
    @Published private(set) var operationRecords: [ReceiptDisplayRecord] = []
    @Published private(set) var errorMessage: String?
    @Published private(set) var isRefreshing = false

    private let planURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/monday-planner/daily-plan.json")

    var statusLabel: String { plan != nil ? "Current projection" : (errorMessage ?? "Projection unavailable") }
    var unavailableMessage: String? { plan == nil ? (errorMessage ?? "A current MONDAY projection is unavailable.") : nil }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let data = try Data(contentsOf: planURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(CommandCenterPlan.self, from: data)
            guard decoded.validation() == .current else { throw CommandCenterLoadError.notCurrent }
            plan = decoded
            activityRecords = loadActivity(from: decoded.brief?.activityLedger.path)
            operationRecords = loadOperations(from: decoded.brief?.operations.path)
            errorMessage = nil
        } catch {
            plan = nil
            activityRecords = []
            operationRecords = []
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "The current Command Center projection could not be read."
        }
    }

    private func loadActivity(from path: String?) -> [ReceiptDisplayRecord] {
        guard let path, let text = try? String(contentsOfFile: path, encoding: .utf8) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return text.split(separator: "\n").reversed().prefix(25).compactMap { line in
            try? decoder.decode(ReceiptDisplayRecord.self, from: Data(line.utf8))
        }
    }

    private func loadOperations(from path: String?) -> [ReceiptDisplayRecord] {
        guard let path else { return [] }
        let root = URL(fileURLWithPath: path, isDirectory: true)
        guard let files = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return files.filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
            .prefix(25)
            .compactMap { url in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return try? decoder.decode(ReceiptDisplayRecord.self, from: data)
            }
    }
}

private enum CommandCenterLoadError: LocalizedError {
    case notCurrent
    var errorDescription: String? { "The available projection is stale, expired, or for another date. Rebuild today's MONDAY plan." }
}

private struct ReceiptDisplayRecord: Decodable, Identifiable {
    let id: String
    let summary: String?
    let source: String?
    let operation: String?
    let status: String?
    let occurredAt: Date?
    let completedAt: Date?
    let evidenceClass: String?
    let limitations: [String]?
    let openQuestions: [String]?

    var title: String { summary ?? operation ?? id }
    var detail: String { [source, status, evidenceClass].compactMap { $0 }.joined(separator: " · ") }
    var timestamp: Date? { occurredAt ?? completedAt }
}

private struct ProjectPortfolioPage: View {
    let title: String
    let subtitle: String
    let projects: [CommandCenterProjectSummary]
    let unavailable: String?

    var body: some View {
        CommandCenterPage(title: title, subtitle: subtitle, icon: "rectangle.3.group.fill") {
            if let unavailable {
                CommandCenterUnavailable(message: unavailable)
            } else if projects.isEmpty {
                CommandCenterEmpty(message: "No active project records were included in the current projection.")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 285), spacing: 14)], spacing: 14) {
                    ForEach(projects) { project in
                        CommandCenterCard {
                            VStack(alignment: .leading, spacing: 11) {
                                HStack {
                                    Text(project.status.uppercased())
                                        .font(.system(size: 9, weight: .black, design: .rounded))
                                        .foregroundStyle(project.status == "blocked" ? CommandCenterPalette.bad : CommandCenterPalette.accent)
                                    Spacer()
                                    Text(project.evidenceStatus.uppercased())
                                        .font(.system(size: 8, weight: .bold, design: .rounded))
                                        .foregroundStyle(.secondary)
                                }
                                Text(project.title).font(.system(size: 18, weight: .semibold, design: .rounded))
                                if !project.outcome.isEmpty { Text(project.outcome).foregroundStyle(.secondary) }
                                Divider().overlay(CommandCenterPalette.line)
                                Text(project.nextAction.isEmpty ? "Next action is unresolved." : project.nextAction)
                                    .font(.system(size: 12, design: .rounded))
                                Text("Owner: \(project.owner) · Updated: \(project.updated)")
                                    .font(.system(size: 10, design: .rounded)).foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct MeetingContinuityPage: View {
    let summary: CommandCenterMeetingContinuity?
    let unavailable: String?

    var body: some View {
        CommandCenterPage(
            title: "Meeting Continuity",
            subtitle: "Completed meetings are counted, dispositioned, routed, and validated against relevant projects.",
            icon: "person.2.wave.2.fill"
        ) {
            if let unavailable {
                CommandCenterUnavailable(message: unavailable)
            } else if let summary {
                HStack(spacing: 14) {
                    CommandCenterMetric(value: "\(summary.occurrenceCount)", label: "OCCURRENCES", color: CommandCenterPalette.accent)
                    CommandCenterMetric(value: "\(summary.unresolvedCount)", label: "UNRESOLVED", color: summary.unresolvedCount == 0 ? CommandCenterPalette.good : CommandCenterPalette.warning)
                    CommandCenterMetric(value: "\(summary.byStatus.count)", label: "DISPOSITIONS", color: CommandCenterPalette.violet)
                }
                CommandCenterCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Disposition ledger").font(.system(size: 16, weight: .semibold, design: .rounded))
                        ForEach(summary.byStatus.keys.sorted(), id: \.self) { status in
                            HStack {
                                Text(status.replacingOccurrences(of: "-", with: " ").capitalized)
                                Spacer()
                                Text("\(summary.byStatus[status] ?? 0)").foregroundStyle(CommandCenterPalette.accent)
                            }
                            .font(.system(size: 13, design: .rounded))
                        }
                        Text(summary.ledger)
                            .font(.system(size: 10, design: .monospaced)).foregroundStyle(.tertiary)
                            .textSelection(.enabled)
                    }
                }
            } else {
                CommandCenterEmpty(message: "Meeting Continuity was not included in this projection.")
            }
        }
    }
}

private struct ReceiptPage: View {
    let title: String
    let subtitle: String
    let records: [ReceiptDisplayRecord]
    let count: Int?
    let path: String?
    let unavailable: String?

    var body: some View {
        CommandCenterPage(title: title, subtitle: subtitle, icon: "list.bullet.clipboard.fill") {
            if let unavailable {
                CommandCenterUnavailable(message: unavailable)
            } else {
                HStack(spacing: 14) {
                    CommandCenterMetric(value: "\(count ?? 0)", label: "RECORDED", color: CommandCenterPalette.accent)
                    CommandCenterMetric(value: "\(records.count)", label: "VISIBLE", color: CommandCenterPalette.violet)
                }
                if records.isEmpty {
                    CommandCenterEmpty(message: "No readable receipts were included at the governed path.")
                } else {
                    ForEach(records) { record in
                        CommandCenterCard {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack {
                                    Text(record.title).font(.system(size: 14, weight: .semibold, design: .rounded))
                                    Spacer()
                                    if let timestamp = record.timestamp {
                                        Text(timestamp.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(.tertiary)
                                    }
                                }
                                if !record.detail.isEmpty { Text(record.detail).foregroundStyle(.secondary) }
                                ForEach(record.limitations ?? [], id: \.self) { Text("Limitation: \($0)").foregroundStyle(CommandCenterPalette.warning) }
                                ForEach(record.openQuestions ?? [], id: \.self) { Text("Open: \($0)").foregroundStyle(CommandCenterPalette.warning) }
                            }
                            .font(.system(size: 11, design: .rounded))
                        }
                    }
                }
                if let path {
                    Text(path).font(.system(size: 9, design: .monospaced)).foregroundStyle(.tertiary).textSelection(.enabled)
                }
            }
        }
    }
}

private struct ResearchChroniclePage: View {
    @State private var entries: [ChronicleEntry] = []
    @State private var selected: ChronicleEntry?
    @State private var errorMessage: String?

    private let root = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Knowledge Vault/Monday Knowledge/500 Research Journal", isDirectory: true)

    var body: some View {
        CommandCenterPage(
            title: "Research Chronicle",
            subtitle: "Verified MONDAY app, plugin, and system-building work from the governed Research Journal.",
            icon: "text.book.closed.fill"
        ) {
            if let errorMessage {
                CommandCenterUnavailable(message: errorMessage)
            } else if entries.isEmpty {
                CommandCenterEmpty(message: "No Research Chronicle entries were found.")
            } else {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(entries) { entry in
                            Button { selected = entry } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(entry.title).fontWeight(.semibold).lineLimit(2)
                                    Text(entry.modified.formatted(date: .abbreviated, time: .omitted)).foregroundStyle(.secondary)
                                }
                                .font(.system(size: 11, design: .rounded))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                                .background(selected?.id == entry.id ? Color.white.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 9))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(width: 260)

                    CommandCenterCard {
                        ScrollView {
                            Text(selected?.content ?? "Choose an entry.")
                                .font(.system(size: 14, design: .serif)).lineSpacing(5).textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(minHeight: 520)
                    }
                }
            }
        }
        .task { load() }
    }

    private func load() {
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            errorMessage = "The governed Research Chronicle directory could not be read at \(root.path)."
            return
        }
        entries = enumerator.compactMap { item in
            guard let url = item as? URL, url.pathExtension.lowercased() == "md",
                  let content = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            let values = try? url.resourceValues(forKeys: [.contentModificationDateKey])
            let title = content.split(separator: "\n").first(where: { $0.hasPrefix("#") })?
                .trimmingCharacters(in: CharacterSet(charactersIn: "# ")) ?? url.deletingPathExtension().lastPathComponent
            return ChronicleEntry(id: url.path, title: title, content: content, modified: values?.contentModificationDate ?? .distantPast)
        }
        .sorted { $0.modified > $1.modified }
        selected = entries.first
        errorMessage = nil
    }
}

private struct ChronicleEntry: Identifiable {
    let id: String
    let title: String
    let content: String
    let modified: Date
}

private struct CommandCenterPage<Content: View>: View {
    let title: String
    let subtitle: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 7) {
                    Label("MONDAY COMMAND CENTER", systemImage: icon)
                        .font(.system(size: 10, weight: .black, design: .rounded)).tracking(1.3)
                        .foregroundStyle(CommandCenterPalette.accent)
                    Text(title).font(.system(size: 30, weight: .semibold, design: .rounded))
                    Text(subtitle).font(.system(size: 13, design: .rounded)).foregroundStyle(.secondary)
                }
                content
            }
            .padding(28)
        }
    }
}

private struct CommandCenterCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(CommandCenterPalette.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(CommandCenterPalette.line, lineWidth: 1))
    }
}

private struct CommandCenterMetric: View {
    let value: String
    let label: String
    let color: Color
    var body: some View {
        CommandCenterCard {
            Text(value).font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(color)
            Text(label).font(.system(size: 9, weight: .black, design: .rounded)).tracking(1).foregroundStyle(.secondary)
        }
    }
}

private struct CommandCenterUnavailable: View {
    let message: String
    var body: some View {
        CommandCenterCard {
            Label("Projection unavailable", systemImage: "externaldrive.badge.exclamationmark")
                .font(.system(size: 18, weight: .semibold, design: .rounded)).foregroundStyle(CommandCenterPalette.warning)
            Text(message).foregroundStyle(.secondary).padding(.top, 4)
            Text("No fallback status is invented.").font(.caption).foregroundStyle(.tertiary).padding(.top, 4)
        }
    }
}

private struct CommandCenterEmpty: View {
    let message: String
    var body: some View {
        CommandCenterCard { Label(message, systemImage: "tray.fill").foregroundStyle(.secondary) }
    }
}

private enum CommandCenterPalette {
    static let background = LinearGradient(
        colors: [Color(red: 0.008, green: 0.016, blue: 0.030), Color(red: 0.018, green: 0.045, blue: 0.075)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let card = Color(red: 0.025, green: 0.070, blue: 0.110).opacity(0.92)
    static let line = Color.white.opacity(0.09)
    static let accent = Color(red: 0.25, green: 0.82, blue: 1.0)
    static let violet = Color(red: 0.67, green: 0.45, blue: 1.0)
    static let good = Color(red: 0.34, green: 0.84, blue: 0.61)
    static let warning = Color(red: 0.95, green: 0.60, blue: 0.23)
    static let bad = Color(red: 1.0, green: 0.35, blue: 0.42)
}
