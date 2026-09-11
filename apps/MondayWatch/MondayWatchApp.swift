import MONDAYCore
import SwiftUI

@main
struct MondayWatchApp: App {
    var body: some Scene {
        WindowGroup { MondayWatchView() }
    }
}

private struct MondayWatchView: View {
    @State private var approved = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Circle()
                        .fill(AngularGradient(colors: [.cyan, .purple, .mint, .cyan], center: .center))
                        .frame(width: 26, height: 26)
                        .shadow(color: .purple, radius: 8)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("MONDAY").font(.system(size: 12, weight: .heavy, design: .rounded))
                        Text("APPROVAL").font(.system(size: 7, weight: .bold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }

                if approved {
                    Label("Approved once", systemImage: "checkmark.seal.fill")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(.mint)
                    Text("The Mac will execute and verify the Calendar result.")
                        .font(.system(size: 10, design: .rounded))
                        .foregroundStyle(.secondary)
                } else {
                    Text("Protect focus time")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                    Text("Create one reversible event. No standing authority.")
                        .font(.system(size: 10, design: .rounded))
                        .foregroundStyle(.secondary)
                    Button("Approve once") { approved = true }
                        .buttonStyle(.borderedProminent)
                        .tint(.purple)
                    Button("Not now", role: .cancel) { }
                        .buttonStyle(.bordered)
                }
            }
        }
    }
}
