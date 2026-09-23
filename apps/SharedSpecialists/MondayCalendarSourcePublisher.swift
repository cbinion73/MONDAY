import EventKit
import Foundation

/// Publishes the Mac's successful Calendar read as a bounded source artifact for the MONDAY plugin.
/// The artifact contains only title and time. It never contains event bodies, attendees, or secrets.
enum MondayCalendarSourcePublisher {
    static func publish(events: [EKEvent], date: Date, calendar: Calendar = .autoupdatingCurrent) throws {
#if os(macOS)
        let now = Date.now
        let dayStart = calendar.startOfDay(for: date)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
        let artifactURL = sourceRoot.appendingPathComponent("apple-calendar.json")
        let manifestURL = sourceRoot.appendingPathComponent("apple-calendar.manifest.json")
        let dayFormatter = DateFormatter()
        dayFormatter.calendar = calendar
        dayFormatter.locale = Locale(identifier: "en_US_POSIX")
        dayFormatter.dateFormat = "yyyy-MM-dd"
        let timeFormatter = DateFormatter()
        timeFormatter.calendar = calendar
        timeFormatter.locale = Locale(identifier: "en_US_POSIX")
        timeFormatter.dateFormat = "HH:mm"

        let artifact = CalendarArtifact(
            schemaVersion: 1,
            date: dayFormatter.string(from: date),
            generatedAt: now,
            timezone: calendar.timeZone.identifier,
            items: events.map {
                CalendarArtifactItem(
                    time: timeFormatter.string(from: $0.startDate),
                    end: timeFormatter.string(from: $0.endDate),
                    title: $0.title ?? "Untitled event"
                )
            }
        )
        try write(artifact, to: artifactURL)
        let manifest = CalendarSourceManifest(
            schemaVersion: 1,
            sourceID: "apple-calendar",
            name: "Apple Calendar",
            kind: "calendar",
            status: events.isEmpty ? "empty" : "available",
            attemptedAt: now,
            succeededAt: now,
            windowStart: dayStart,
            windowEnd: dayEnd,
            itemCount: events.count,
            processedCount: events.count,
            unresolvedCount: 0,
            watermark: nil,
            freshnessHours: 12,
            detail: events.isEmpty
                ? "Apple Calendar was read successfully and contained no timed events for this date."
                : "Apple Calendar was read successfully for this date.",
            error: "",
            artifact: artifactURL.path
        )
        try write(manifest, to: manifestURL)
#endif
    }

    static func publishFailure(_ error: Error, date: Date, calendar: Calendar = .autoupdatingCurrent) {
#if os(macOS)
        let now = Date.now
        let dayStart = calendar.startOfDay(for: date)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
        let manifest = CalendarSourceManifest(
            schemaVersion: 1,
            sourceID: "apple-calendar",
            name: "Apple Calendar",
            kind: "calendar",
            status: "blocked",
            attemptedAt: now,
            succeededAt: nil,
            windowStart: dayStart,
            windowEnd: dayEnd,
            itemCount: nil,
            processedCount: nil,
            unresolvedCount: nil,
            watermark: nil,
            freshnessHours: 12,
            detail: "Apple Calendar could not be read. The schedule must not be treated as clear.",
            error: String(describing: error),
            artifact: sourceRoot.appendingPathComponent("apple-calendar.json").path
        )
        try? write(manifest, to: sourceRoot.appendingPathComponent("apple-calendar.manifest.json"))
#endif
    }

#if os(macOS)
    private static let sourceRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".codex/monday-sources", isDirectory: true)

    private static func write<T: Encodable>(_ value: T, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(value).write(to: url, options: [.atomic])
    }
#endif
}

private struct CalendarArtifact: Encodable {
    let schemaVersion: Int
    let date: String
    let generatedAt: Date
    let timezone: String
    let items: [CalendarArtifactItem]
}

private struct CalendarArtifactItem: Encodable {
    let time: String
    let end: String
    let title: String
}

private struct CalendarSourceManifest: Encodable {
    let schemaVersion: Int
    let sourceID: String
    let name: String
    let kind: String
    let status: String
    let attemptedAt: Date
    let succeededAt: Date?
    let windowStart: Date
    let windowEnd: Date
    let itemCount: Int?
    let processedCount: Int?
    let unresolvedCount: Int?
    let watermark: String?
    let freshnessHours: Int
    let detail: String
    let error: String
    let artifact: String
}
