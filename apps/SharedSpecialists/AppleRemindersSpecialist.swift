import EventKit
import Foundation
import MONDAYCore

// Reminders owns reminder records. MONDAY owns routing, policy, approval, and verified follow-through.

actor AppleRemindersSpecialist: MondaySpecialist {
    private struct ReminderSnapshot: Sendable {
        let title: String
        let listTitle: String
    }

    private let store = EKEventStore()
    private let calendar = Calendar.autoupdatingCurrent

    var descriptor: CapabilityDescriptor {
        get async {
            let status = EKEventStore.authorizationStatus(for: .reminder)
            let health: CapabilityHealth
            let detail: String
            switch status {
            case .fullAccess:
                health = .available
                detail = "Reminders access is ready"
            case .writeOnly:
                health = .degraded
                detail = "Write-only access; verification is unavailable"
            case .notDetermined:
                health = .needsPermission
                detail = "MONDAY will ask when you request reminder help"
            case .denied, .restricted:
                health = .unavailable
                detail = "Reminders access is blocked in Settings"
            @unknown default:
                health = .unavailable
                detail = "Unknown EventKit authorization state"
            }
            return CapabilityDescriptor(
                id: "apple.reminders",
                name: "Reminders",
                owner: "Apple Reminders",
                summary: "Reads reminders and creates an approved reminder through EventKit.",
                appleTechnology: "EventKit",
                health: health,
                statusDetail: detail,
                supportedSurfaces: [.mac, .iPhone, .iPad, .watch, .carPlay],
                actions: ["review reminders", "create reminder"],
                verificationMethod: "Read the saved EKReminder back by its calendar item identifier"
            )
        }
    }

    func canHandle(_ request: SpecialistRequest) -> Bool {
        let text = request.text.lowercased()
        return ["remind me", "reminder", "remember to", "to-do", "todo"].contains {
            text.contains($0)
        }
    }

    func respond(to request: SpecialistRequest) async throws -> SpecialistResponse {
        guard request.workspace.settings.awarenessEnabled,
              request.workspace.settings.remindersRead,
              request.workspace.connections.first(where: { $0.id == "apple.reminders" })?.policy.observe != false else {
            throw SpecialistError.permissionRequired("Reminder observation is disabled in MONDAY’s Trust Center.")
        }
        try await ensureFullAccess()

        let lower = request.text.lowercased()
        let asksToCreate = lower.contains("remind me")
            || lower.contains("remember to")
            || lower.contains("create a reminder")
            || lower.contains("add a reminder")

        guard asksToCreate else {
            let incomplete = try await fetchIncompleteReminders()
            let evidence = incomplete.prefix(6).map { reminder in
                Evidence(
                    kind: .sourceClaim,
                    source: "Apple Reminders · \(reminder.listTitle)",
                    claim: reminder.title,
                    confidence: .verified
                )
            }
            let narrative = incomplete.isEmpty
                ? "You’re clear—no incomplete reminders hiding in the shrubbery."
                : "You have \(incomplete.count) incomplete reminder\(incomplete.count == 1 ? "" : "s"). First in line: “\(incomplete[0].title)”."
            return SpecialistResponse(narrative: narrative, evidence: evidence)
        }

        guard request.workspace.settings.remindersWrite else {
            throw SpecialistError.permissionRequired("Reminder action authority is disabled in MONDAY’s Trust Center.")
        }

        let title = normalizedTitle(from: request.text)
        guard !title.isEmpty else {
            throw SpecialistError.invalidProposal("Tell MONDAY what the reminder should say.")
        }
        let dueDate = inferredDueDate(from: lower, now: request.now)
        var parameters = ["title": title]
        if let dueDate { parameters["due"] = ISO8601DateFormatter().string(from: dueDate) }

        let timing = dueDate.map {
            " due \($0.formatted(date: .abbreviated, time: .shortened))"
        } ?? " with no due date"
        let proposal = ActionProposal(
            capabilityID: "apple.reminders",
            title: "Create reminder",
            explanation: "Create “\(title)”\(timing) in Apple Reminders. Nothing changes until you approve.",
            consequence: .consequential,
            parameters: parameters,
            reversible: true
        )
        return SpecialistResponse(
            narrative: "I’ve lined up the reminder below. Nothing has changed yet—your move.",
            evidence: [
                Evidence(kind: .recommended, source: "MONDAY intent interpretation", claim: "Reminder title: \(title)\(timing)", confidence: .high)
            ],
            proposal: proposal
        )
    }

    func execute(_ proposal: ActionProposal) async throws -> ExecutionResult {
        guard proposal.capabilityID == "apple.reminders",
              let title = proposal.parameters["title"] else {
            throw SpecialistError.invalidProposal("The Reminders proposal was incomplete.")
        }
        try await ensureFullAccess()
        guard let destination = store.defaultCalendarForNewReminders() else {
            throw SpecialistError.unavailable("Apple Reminders has no writable default list.")
        }

        let reminder = EKReminder(eventStore: store)
        reminder.title = title
        reminder.calendar = destination
        if let dueText = proposal.parameters["due"],
           let dueDate = ISO8601DateFormatter().date(from: dueText) {
            reminder.dueDateComponents = calendar.dateComponents(
                [.calendar, .timeZone, .year, .month, .day, .hour, .minute],
                from: dueDate
            )
        }
        try store.save(reminder, commit: true)

        let identifier = reminder.calendarItemIdentifier
        guard let saved = store.calendarItem(withIdentifier: identifier) as? EKReminder,
              saved.title == title,
              !saved.isCompleted else {
            return ExecutionResult(
                succeeded: false,
                attempted: "Reminders accepted the save request, but MONDAY could not read the reminder back.",
                verification: nil,
                evidence: [Evidence(kind: .attempted, source: "Apple Reminders", claim: "Save issued; read-back verification failed.", confidence: .verified)]
            )
        }

        let verified = "Apple Reminders contains “\(saved.title ?? title)” in \(saved.calendar.title)."
        return ExecutionResult(
            succeeded: true,
            attempted: "Created the reminder.",
            verification: verified,
            evidence: [Evidence(kind: .verified, source: "Apple Reminders", claim: verified, confidence: .verified)]
        )
    }

    private func ensureFullAccess() async throws {
        switch EKEventStore.authorizationStatus(for: .reminder) {
        case .fullAccess:
            return
        case .notDetermined:
            let granted = try await store.requestFullAccessToReminders()
            guard granted else { throw SpecialistError.permissionRequired("Reminders permission was not granted.") }
        case .writeOnly:
            throw SpecialistError.permissionRequired("MONDAY needs full Reminders access to verify outcomes.")
        case .denied, .restricted:
            throw SpecialistError.permissionRequired("Reminders access is blocked. Enable MONDAY in Settings → Privacy & Security → Reminders.")
        @unknown default:
            throw SpecialistError.unavailable("Apple returned an unknown Reminders authorization state.")
        }
    }

    private func fetchIncompleteReminders() async throws -> [ReminderSnapshot] {
        try await withCheckedThrowingContinuation { continuation in
            let predicate = store.predicateForIncompleteReminders(
                withDueDateStarting: nil,
                ending: nil,
                calendars: nil
            )
            store.fetchReminders(matching: predicate) { reminders in
                let snapshots = (reminders ?? []).map {
                    ReminderSnapshot(
                        title: $0.title ?? "Untitled reminder",
                        listTitle: $0.calendar.title
                    )
                }
                continuation.resume(returning: snapshots.sorted { $0.title < $1.title })
            }
        }
    }

    private func normalizedTitle(from text: String) -> String {
        var result = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let prefixes = [
            "remind me to ", "remind me ", "remember to ",
            "create a reminder to ", "create a reminder ",
            "add a reminder to ", "add a reminder "
        ]
        for prefix in prefixes where result.lowercased().hasPrefix(prefix) {
            result.removeFirst(prefix.count)
            break
        }
        for timing in [" tomorrow morning", " tomorrow", " tonight", " today"] {
            if let range = result.range(of: timing, options: [.caseInsensitive, .backwards]),
               range.upperBound == result.endIndex {
                result.removeSubrange(range)
                break
            }
        }
        return result.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
    }

    private func inferredDueDate(from text: String, now: Date) -> Date? {
        if text.contains("tomorrow morning") {
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: now)!
            return calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow)
        }
        if text.contains("tomorrow") {
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: now)!
            return calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow)
        }
        if text.contains("tonight") {
            return calendar.date(bySettingHour: 19, minute: 0, second: 0, of: now)
        }
        return nil
    }
}
