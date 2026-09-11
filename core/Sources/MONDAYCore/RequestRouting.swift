import Foundation

/// Deterministic routing for requests that should reach Apple-owned domain
/// specialists before conversational synthesis. Keeping this in the shared core
/// makes Mac, iPhone, iPad, Watch, CarPlay, and Siri interpret the same words.
public enum MondayRequestRouting {
    public static func isEmailRequest(_ text: String) -> Bool {
        let lower = text.lowercased()
        return ["email", "e-mail", "mail", "inbox"].contains(where: lower.contains)
    }

    public static func requestedApplicationName(_ text: String) -> String? {
        let lower = text.lowercased()
        let words = Set(lower.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init))
        guard ["open", "launch", "start"].contains(where: words.contains) else { return nil }
        if words.contains("forge") { return "FORGE" }
        if words.contains("midas") { return "Midas" }
        if words.contains("ghostwritr") { return "Ghostwritr" }
        return nil
    }

    public static func isCalendarRequest(_ text: String) -> Bool {
        let lower = text.lowercased()
        let calendarLanguage = [
            "calendar", "schedule", "appointment", "meeting", "event",
            "free time", "availability", "focus block", "protect time",
            "what do i have today", "what's on my day", "what is on my day",
            "what's on today", "what is on today", "my schedule today",
            "how's my day", "hows my day", "how is my day", "day looking",
            "today looking", "plan my day"
        ]
        return calendarLanguage.contains(where: lower.contains)
    }

    public static func shouldUsePersonalVaultContext(_ text: String) -> Bool {
        let lower = text.lowercased()
        let operationalRequests = [
            "calendar", "schedule", "appointment", "meeting", "today", "my day",
            "email", "mail", "inbox", "reminder", "weather", "news", "search the web"
        ]
        if operationalRequests.contains(where: lower.contains) { return false }

        let personalContext = [
            "who am i", "about me", "know about me", "my goal", "my priority", "my priorities",
            "what matters", "my mission", "my values", "my preference", "my family", "my health",
            "my life", "my writing", "my voice", "my focus", "my commitment", "my pattern",
            "my tension", "my contradiction", "my capacity", "based on what you know"
        ]
        return personalContext.contains(where: lower.contains)
    }
}
