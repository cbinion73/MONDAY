import Foundation
import MONDAYCore
import SwiftUI

typealias PlannerPageData = CommandCenterPlan
typealias PlannerPageSource = CommandCenterSource
typealias PlannerPageScheduleItem = CommandCenterScheduleItem
typealias PlannerPagePriorities = CommandCenterPriorities
typealias PlannerPageCompassItem = CommandCenterCompassItem

/// Shared Franklin-style planner rendering used by both Apple surfaces.
struct MondayPlannerPageView: View {
    let plan: PlannerPageData?
    let statusMessage: String

    var body: some View {
        ZStack {
            MondayPlannerPalette.background.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 18) {
                    plannerHeader

                    if let plan {
                        PlannerSourceHealthStrip(plan: plan)
                            .padding(.horizontal, 16)
                    }

                    // Keep the two-column paper composition where there is room,
                    // then stack it on iPhone so text never becomes artificially narrow.
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: 16) {
                            PlannerPageScheduleColumn(plan: plan)
                            PlannerPageTaskColumn(plan: plan)
                        }
                        .frame(minWidth: 700)

                        VStack(spacing: 18) {
                            PlannerPageScheduleColumn(plan: plan)
                            PlannerPageTaskColumn(plan: plan)
                        }
                    }

                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: 16) {
                            PlannerPageNotesColumn(plan: plan)
                            PlannerPageCompassColumn(plan: plan)
                        }
                        .frame(minWidth: 700)

                        VStack(spacing: 18) {
                            PlannerPageNotesColumn(plan: plan)
                            PlannerPageCompassColumn(plan: plan)
                        }
                    }

                    Text(footerText)
                        .font(.system(size: 8, weight: .bold, design: .rounded))
                        .tracking(0.7)
                        .foregroundStyle(MondayPlannerPalette.mutedText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 13)
                }
                .background(MondayPlannerPalette.pageBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .black.opacity(0.42), radius: 24, y: 10)
                .padding(16)
            }
        }
        .preferredColorScheme(.dark)
    }

    private var plannerHeader: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 18) {
                headerTitle
                Spacer(minLength: 18)
                focusBlock
            }

            VStack(alignment: .leading, spacing: 16) {
                headerTitle
                focusBlock
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(20)
    }

    private var headerTitle: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("DAILY PLANNING PAGE")
                .font(.system(size: 10, weight: .black, design: .rounded))
                .tracking(1.35)
                .foregroundStyle(MondayPlannerPalette.accent)
            Text(displayDate)
                .font(.system(size: 27, weight: .semibold, design: .serif))
                .foregroundStyle(MondayPlannerPalette.primaryText)
        }
    }

    private var focusBlock: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Text("PRIMARY FOCUS")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(1.1)
                .foregroundStyle(MondayPlannerPalette.mutedText)
            Text(plan?.primaryFocus ?? statusMessage)
                .font(.system(size: 13, weight: .semibold, design: .serif))
                .foregroundStyle(MondayPlannerPalette.primaryText)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 300, alignment: .trailing)
        }
    }

    private var displayDate: String {
        guard let plan else { return "Planner not prepared" }
        let input = DateFormatter()
        input.locale = Locale(identifier: "en_US_POSIX")
        input.dateFormat = "yyyy-MM-dd"
        guard let parsed = input.date(from: plan.date) else { return plan.date }
        return parsed.formatted(.dateTime.weekday(.wide).month(.wide).day().year())
    }

    private var footerText: String {
        guard let plan else { return statusMessage }
        let identifier = plan.planID.map { " · \($0)" } ?? " · LEGACY UNVERIFIED PLAN"
        return "FRANKLIN-STYLE DAILY PLANNING PAGE · PREPARED BY MONDAY · CALENDAR REMAINS THE OWNER OF TIME\(identifier)"
    }
}

private struct PlannerSourceHealthStrip: View {
    let plan: PlannerPageData

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("SOURCE HEALTH")
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .tracking(1.0)
                    .foregroundStyle(MondayPlannerPalette.primaryText)
                Spacer()
                Text((plan.coverage?.status ?? "legacy").uppercased())
                    .font(.system(size: 8, weight: .black, design: .rounded))
                    .foregroundStyle(statusColor(plan.coverage?.status ?? "unknown"))
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], spacing: 8) {
                ForEach(plan.sources) { source in
                    HStack(spacing: 7) {
                        Circle().fill(statusColor(source.status)).frame(width: 7, height: 7)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(source.name)
                                .font(.system(size: 9, weight: .semibold, design: .rounded))
                                .foregroundStyle(MondayPlannerPalette.primaryText)
                                .lineLimit(1)
                            Text(source.status.uppercased())
                                .font(.system(size: 7, weight: .bold, design: .rounded))
                                .foregroundStyle(MondayPlannerPalette.mutedText)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 9)
                    .padding(.vertical, 7)
                    .background(MondayPlannerPalette.sectionBand.opacity(0.72), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(12)
        .background(Color.black.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "available": MondayPlannerPalette.good
        case "empty": MondayPlannerPalette.empty
        case "partial", "stale": MondayPlannerPalette.warning
        case "blocked", "unavailable": MondayPlannerPalette.bad
        default: MondayPlannerPalette.unknown
        }
    }
}

private struct PlannerPageScheduleColumn: View {
    let plan: PlannerPageData?

    private var schedule: [PlannerPageScheduleItem] {
        (plan?.schedule ?? []).sorted { $0.time < $1.time }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerPageSectionTitle(title: "SCHEDULE", detail: "LOCAL TIME / ONE SOURCE")
            Text(plan == nil
                 ? "No normalized MONDAY plan is available yet."
                 : "Fixed commitments and intentional focus blocks, rendered in \(plan?.timezone ?? "local") time.")
                .font(.system(size: 10, design: .serif))
                .foregroundStyle(MondayPlannerPalette.secondaryText)
                .padding(.horizontal, 14)
                .padding(.vertical, 11)

            if schedule.isEmpty {
                Text(emptyScheduleMessage)
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(MondayPlannerPalette.secondaryText)
                    .padding(14)
            } else {
                ForEach(Array(schedule.enumerated()), id: \.offset) { _, item in
                    let eventColor = MondayPlannerEventColor.forTitle(item.title)
                    HStack(alignment: .center, spacing: 8) {
                        Capsule().fill(eventColor).frame(width: 4)
                        Text("\(displayTime(item.time))–\(displayTime(item.end))")
                            .font(.system(size: 9, weight: .bold, design: .rounded))
                            .foregroundStyle(eventColor)
                            .frame(width: 92, alignment: .trailing)
                        Text(item.title)
                            .font(.system(size: 11, design: .serif))
                            .foregroundStyle(MondayPlannerPalette.primaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(eventColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func displayTime(_ time: String) -> String {
        let pieces = time.split(separator: ":")
        guard pieces.count >= 2, let hour = Int(pieces[0]) else { return time }
        let minute = String(pieces[1])
        let shownHour = hour > 12 ? hour - 12 : (hour == 0 ? 12 : hour)
        return "\(shownHour):\(minute) \(hour >= 12 ? "PM" : "AM")"
    }

    private var emptyScheduleMessage: String {
        guard let plan else { return "No current MONDAY plan is available." }
        guard let calendarSource = plan.sources.first(where: { $0.kind == "calendar" }) else {
            return "Calendar coverage is unknown. No Calendar source was included in this plan."
        }
        switch calendarSource.status.lowercased() {
        case "empty":
            return "Calendar was checked successfully and contains no timed events for this date."
        case "available":
            return "Calendar was checked successfully, but no timed events were included for this date."
        case "stale":
            return "Calendar coverage is stale. Refresh Calendar before relying on this schedule."
        case "blocked":
            return "Calendar access is blocked. Enable Calendar access, then rebuild the plan."
        case "unavailable":
            return "Calendar was unavailable when this plan was prepared. This is not a clear schedule."
        case "partial":
            return "Calendar coverage was partial. Some commitments may be missing."
        default:
            return "Calendar coverage is unknown. This is not evidence that the day is clear."
        }
    }
}

private struct PlannerPageTaskColumn: View {
    let plan: PlannerPageData?

    private var items: [(String, String)] {
        let a = (plan?.priorities.a ?? []).enumerated().map { ("A\($0.offset + 1)", $0.element) }
        let b = (plan?.priorities.b ?? []).enumerated().map { ("B\($0.offset + 1)", $0.element) }
        let c = (plan?.priorities.c ?? []).enumerated().map { ("C\($0.offset + 1)", $0.element) }
        return a + b + c
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerPageSectionTitle(title: "PRIORITIZED DAILY TASK LIST", detail: "A / B / C")
            if items.isEmpty {
                Text("No prioritized tasks were returned by the normalized planner payload.")
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(MondayPlannerPalette.secondaryText)
                    .padding(14)
            } else {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 9) {
                        Text(item.0)
                            .font(.system(size: 9, weight: .black, design: .rounded))
                            .foregroundStyle(MondayPlannerPalette.accent)
                            .frame(width: 25, alignment: .leading)
                        Text(item.1)
                            .font(.system(size: 11, design: .serif))
                            .foregroundStyle(MondayPlannerPalette.primaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct PlannerPageNotesColumn: View {
    let plan: PlannerPageData?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerPageSectionTitle(title: "NOTES & IDEAS", detail: "CAPTURE")
            if let notes = plan?.notes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(notes.enumerated()), id: \.offset) { _, note in
                        Text(note)
                            .font(.system(size: 11, design: .serif))
                            .foregroundStyle(MondayPlannerPalette.primaryText)
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 15)
            } else {
                Text("No notes were returned by the normalized planner payload.")
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(MondayPlannerPalette.secondaryText)
                    .padding(14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct PlannerPageCompassColumn: View {
    let plan: PlannerPageData?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerPageSectionTitle(title: "DAILY COMPASS", detail: "ROLES / GOALS")
            if let compass = plan?.compass, !compass.isEmpty {
                VStack(alignment: .leading, spacing: 17) {
                    ForEach(Array(compass.enumerated()), id: \.offset) { _, item in
                        VStack(alignment: .leading, spacing: 8) {
                            PlannerPageCompassRow(label: "ROLE", value: item.role)
                            PlannerPageCompassRow(label: "GOAL", value: item.goal)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 16)
            } else {
                Text("No compass roles were returned by the normalized planner payload.")
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(MondayPlannerPalette.secondaryText)
                    .padding(14)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct PlannerPageCompassRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.system(size: 9, weight: .black, design: .rounded))
                .tracking(0.8)
                .foregroundStyle(MondayPlannerPalette.accent)
                .frame(width: 38, alignment: .leading)
            Text(value)
                .font(.system(size: 12, design: .serif))
                .foregroundStyle(MondayPlannerPalette.primaryText)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct PlannerPageSectionTitle: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.system(size: 10, weight: .black, design: .rounded))
                .tracking(0.9)
                .foregroundStyle(MondayPlannerPalette.primaryText)
            Spacer(minLength: 8)
            Text(detail)
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .tracking(0.6)
                .foregroundStyle(MondayPlannerPalette.mutedText)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(MondayPlannerPalette.sectionBand)
    }
}

private enum MondayPlannerPalette {
    static let background = LinearGradient(
        colors: [
            Color(red: 0.008, green: 0.016, blue: 0.030),
            Color(red: 0.018, green: 0.045, blue: 0.075),
            Color(red: 0.010, green: 0.026, blue: 0.050)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let pageBackground = LinearGradient(
        colors: [Color(red: 0.018, green: 0.055, blue: 0.090), Color(red: 0.010, green: 0.028, blue: 0.052)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let sectionBand = Color(red: 0.020, green: 0.085, blue: 0.130).opacity(0.92)
    static let accent = Color(red: 0.25, green: 0.82, blue: 1.0)
    static let primaryText = Color(red: 0.88, green: 0.95, blue: 1.0)
    static let secondaryText = Color(red: 0.62, green: 0.76, blue: 0.86)
    static let mutedText = Color(red: 0.42, green: 0.63, blue: 0.74)
    static let good = Color(red: 0.34, green: 0.84, blue: 0.61)
    static let empty = Color(red: 0.25, green: 0.72, blue: 1.0)
    static let warning = Color(red: 0.95, green: 0.60, blue: 0.23)
    static let bad = Color(red: 1.0, green: 0.35, blue: 0.42)
    static let unknown = Color(red: 0.58, green: 0.62, blue: 0.69)
}

private enum MondayPlannerEventColor {
    static func forTitle(_ title: String) -> Color {
        let event = title.lowercased()
        if event.contains("devotional") || event.contains("prayer") || event.contains("church") { return Color(red: 0.95, green: 0.60, blue: 0.23) }
        if event.contains("walk") || event.contains("workout") || event.contains("breakfast") { return Color(red: 0.34, green: 0.84, blue: 0.61) }
        if event.contains("lunch") { return Color(red: 1.0, green: 0.56, blue: 0.24) }
        if event.contains("focus") || event.contains("planning") { return Color(red: 0.25, green: 0.72, blue: 1.0) }
        if event.contains("review") || event.contains("demo") || event.contains("meeting") || event.contains("stand up") || event.contains("sync") { return Color(red: 0.67, green: 0.45, blue: 1.0) }
        return MondayPlannerPalette.accent
    }
}
