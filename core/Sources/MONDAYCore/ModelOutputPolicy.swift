import Foundation

public enum ModelOutputPolicy {
    private static let forbiddenCompletionClaims = [
        "i have sent", "i’ve sent", "i've sent",
        "i have scheduled", "i’ve scheduled", "i've scheduled",
        "i have created", "i’ve created", "i've created",
        "i have saved", "i’ve saved", "i've saved",
        "i have deleted", "i’ve deleted", "i've deleted",
        "i have updated", "i’ve updated", "i've updated",
        "i have booked", "i’ve booked", "i've booked",
        "i have ordered", "i’ve ordered", "i've ordered",
        "successfully sent", "successfully scheduled", "successfully created",
        "successfully saved", "successfully deleted", "successfully booked"
    ]

    public static func enforceNonAuthority(_ narrative: String) -> String {
        let normalized = narrative.lowercased()
        guard forbiddenCompletionClaims.contains(where: normalized.contains) else {
            return narrative
        }
        return "I can help reason about or prepare that, but the on-device model cannot perform or verify actions. I have not changed anything."
    }
}
