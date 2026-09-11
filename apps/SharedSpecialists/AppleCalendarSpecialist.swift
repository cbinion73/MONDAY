import EventKit
import Foundation
import MONDAYCore

// Domain ownership stays in this specialist; MONDAY owns routing, approval, and continuity.

actor AppleCalendarSpecialist: MondaySpecialist {
    private let store = EKEventStore()
    private let calendar = Calendar.autoupdatingCurrent

    var descriptor: CapabilityDescriptor {
        get async {
            let status = EKEventStore.authorizationStatus(for: .event)
            let health: CapabilityHealth
            let detail: String
            switch status {
            case .fullAccess:
                health = .available
                detail = "Calendar access is ready"
            case .writeOnly:
                health = .degraded
                detail = "Write-only access; schedule reasoning is unavailable"
            case .denied, .restricted:
                health = .unavailable
                detail = "Calendar access is blocked in System Settings"
            case .notDetermined:
                health = .needsPermission
                detail = "MONDAY will ask when you request calendar help"
            @unknown default:
                health = .unavailable
                detail = "Unknown EventKit authorization state"
            }
            return CapabilityDescriptor(
                id: "apple.calendar",
                name: "Calendar",
                owner: "Apple Calendar",
                summary: "Reads schedule context and creates approved, reversible focus blocks.",
                appleTechnology: "EventKit",
                health: health,
                statusDetail: detail,
                supportedSurfaces: [.mac, .iPhone, .iPad, .watch, .carPlay],
                actions: ["read today", "find free time", "create focus block"],
                verificationMethod: "Read the saved EKEvent back by its identifier"
            )
        }
    }

    func canHandle(_ request: SpecialistRequest) -> Bool {
        MondayRequestRouting.isCalendarRequest(request.text)
    }

    func respond(to request: SpecialistRequest) async throws -> SpecialistResponse {
        guard request.workspace.settings.awarenessEnabled,
              request.workspace.settings.calendarRead,
              request.workspace.connections.first(where: { $0.id == "apple.calendar" })?.policy.observe != false else {
            throw SpecialistError.permissionRequired("Calendar observation is disabled in MONDAY’s Trust Center.")
        }
        try await ensureFullAccess()

        let dayStart = calendar.startOfDay(for: request.now)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
        let events = store.events(matching: store.predicateForEvents(withStart: dayStart, end: dayEnd, calendars: nil))
            .filter { !$0.isAllDay }
            .sorted { $0.startDate < $1.startDate }

        let formatter = DateFormatter()
        formatter.timeStyle = .short
        let eventClaims = events.prefix(5).map {
            Evidence(
                kind: .sourceClaim,
                source: "Apple Calendar · \($0.calendar.title)",
                claim: "\($0.title ?? "Untitled event") · \(formatter.string(from: $0.startDate))–\(formatter.string(from: $0.endDate))",
                confidence: .verified
            )
        }

        let wantsFocus = request.text.lowercased().contains("focus") || request.text.lowercased().contains("protect")
        guard wantsFocus else {
            let headline = events.isEmpty
                ? "Your calendar is genuinely clear today—not wishful thinking; I checked."
                : "You have \(events.count) timed commitment\(events.count == 1 ? "" : "s") today. Next up: \(events[0].title ?? "an untitled event") at \(formatter.string(from: events[0].startDate))."
            return SpecialistResponse(narrative: headline, evidence: eventClaims)
        }

        guard request.workspace.settings.calendarWrite else {
            throw SpecialistError.permissionRequired("Calendar action authority is disabled in MONDAY’s Trust Center.")
        }

        guard let interval = findFocusWindow(events: events, now: request.now, dayEnd: dayEnd) else {
            return SpecialistResponse(
                narrative: "I inspected today’s calendar but couldn’t find a clean 60-minute window before 7 PM. I haven’t changed anything.",
                evidence: eventClaims + [Evidence(kind: .inferred, source: "MONDAY planning", claim: "No conflict-free 60-minute window remained.", confidence: .high)]
            )
        }

        let range = "\(formatter.string(from: interval.start))–\(formatter.string(from: interval.end))"
        let proposal = ActionProposal(
            capabilityID: "apple.calendar",
            title: "Protect focus time",
            explanation: "Create “Protected focus · MONDAY” today from \(range). This is a reversible Calendar event. Nothing changes until you approve.",
            consequence: .consequential,
            parameters: [
                "title": "Protected focus · MONDAY",
                "start": ISO8601DateFormatter().string(from: interval.start),
                "end": ISO8601DateFormatter().string(from: interval.end)
            ],
            reversible: true
        )
        return SpecialistResponse(
            narrative: events.isEmpty
                ? "Your day has room to breathe. I found a clean hour at \(range) and lined up a focus block. Nothing has changed yet."
                : "I worked around \(events.count) calendar commitment\(events.count == 1 ? "" : "s") and found a clean hour at \(range). It’s lined up below; nothing has changed yet.",
            evidence: eventClaims + [Evidence(kind: .recommended, source: "MONDAY planning", claim: "Protect \(range) for uninterrupted focus.", confidence: .high)],
            proposal: proposal
        )
    }

    func execute(_ proposal: ActionProposal) async throws -> ExecutionResult {
        guard proposal.capabilityID == "apple.calendar",
              let title = proposal.parameters["title"],
              let startText = proposal.parameters["start"],
              let endText = proposal.parameters["end"],
              let start = ISO8601DateFormatter().date(from: startText),
              let end = ISO8601DateFormatter().date(from: endText) else {
            throw SpecialistError.invalidProposal("The Calendar proposal was incomplete.")
        }
        try await ensureFullAccess()
        guard let destination = store.defaultCalendarForNewEvents else {
            throw SpecialistError.unavailable("Apple Calendar has no writable default calendar.")
        }

        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = start
        event.endDate = end
        event.calendar = destination
        event.notes = "Created by MONDAY after explicit approval."
        try store.save(event, span: .thisEvent, commit: true)

        guard let identifier = event.eventIdentifier,
              let saved = store.event(withIdentifier: identifier),
              saved.title == title,
              abs(saved.startDate.timeIntervalSince(start)) < 1 else {
            return ExecutionResult(
                succeeded: false,
                attempted: "Calendar accepted the save request, but MONDAY could not read the event back.",
                verification: nil,
                evidence: [Evidence(kind: .attempted, source: "Apple Calendar", claim: "Save issued; read-back verification failed.", confidence: .verified)]
            )
        }

        let formatter = DateFormatter()
        formatter.timeStyle = .short
        let verified = "Apple Calendar contains “\(title)” from \(formatter.string(from: saved.startDate)) to \(formatter.string(from: saved.endDate)) on \(saved.calendar.title)."
        return ExecutionResult(
            succeeded: true,
            attempted: "Created the event.",
            verification: verified,
            evidence: [Evidence(kind: .verified, source: "Apple Calendar", claim: verified, confidence: .verified)]
        )
    }

    private func ensureFullAccess() async throws {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess:
            return
        case .notDetermined:
            let granted = try await store.requestFullAccessToEvents()
            guard granted else { throw SpecialistError.permissionRequired("Calendar permission was not granted.") }
        case .writeOnly:
            throw SpecialistError.permissionRequired("MONDAY needs full Calendar access to find conflicts and verify outcomes.")
        case .denied, .restricted:
            throw SpecialistError.permissionRequired("Calendar access is blocked. Enable MONDAY in System Settings → Privacy & Security → Calendars.")
        @unknown default:
            throw SpecialistError.unavailable("Apple returned an unknown Calendar authorization state.")
        }
    }

    private func findFocusWindow(events: [EKEvent], now: Date, dayEnd: Date) -> DateInterval? {
        let roundedNow = calendar.date(bySetting: .minute, value: 0, of: calendar.date(byAdding: .hour, value: 1, to: now)!) ?? now
        let nineAM = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: now)!
        var cursor = max(roundedNow, nineAM)
        let sevenPM = calendar.date(bySettingHour: 19, minute: 0, second: 0, of: now)!
        let boundary = min(dayEnd, sevenPM)

        for event in events where event.endDate > cursor {
            if event.startDate.timeIntervalSince(cursor) >= 3600 {
                return DateInterval(start: cursor, duration: 3600)
            }
            if event.startDate <= cursor { cursor = max(cursor, event.endDate) }
        }
        guard boundary.timeIntervalSince(cursor) >= 3600 else { return nil }
        return DateInterval(start: cursor, duration: 3600)
    }
}
