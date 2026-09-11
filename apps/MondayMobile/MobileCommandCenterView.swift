import Foundation
import SwiftUI

struct CodexActivitySnapshot: Decodable {
    let source: String
    let generatedAt: Date
    let activeCount: Int
    let threads: [CodexActivityThread]
}

struct CodexActivityThread: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let updatedAt: Date
}

@MainActor
final class CodexActivityFeed: ObservableObject {
    @Published private(set) var snapshot: CodexActivitySnapshot?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let endpoint: URL?
    private let token: String?

    init() {
        let urlString = Bundle.main.object(forInfoDictionaryKey: "CodexActivityBridgeURL") as? String
        let token = Bundle.main.object(forInfoDictionaryKey: "CodexActivityBridgeToken") as? String
        endpoint = urlString.flatMap(URL.init(string:))
        self.token = token?.isEmpty == false ? token : nil
    }

    var isConfigured: Bool { endpoint != nil && token != nil }

    func refresh() async {
        guard let endpoint, let token else {
            errorMessage = "This build is not paired with your Codex bridge."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: endpoint.appendingPathComponent("v1/activity"))
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 8
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            snapshot = try decoder.decode(CodexActivitySnapshot.self, from: data)
            errorMessage = nil
        } catch {
            errorMessage = "Codex is not reachable from this phone right now."
        }
    }
}

/// A thin, read-only companion to the Codex work Chris is actually doing on his Mac.
struct MobileCommandCenterView: View {
    @StateObject private var codexActivity = CodexActivityFeed()

    var body: some View {
        NavigationStack {
            ZStack {
                MondayCommandCenterPalette.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        metrics
                        codexRead
                        codexThreadsSection
                        evidenceBoundary
                    }
                    .padding(18)
                    .padding(.bottom, 28)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("COMMAND CENTER")
                        .font(.system(size: 12, weight: .black, design: .rounded))
                        .tracking(1.5)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await codexActivity.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(codexActivity.isLoading)
                    .accessibilityLabel("Refresh Codex activity")
                }
            }
        }
        .preferredColorScheme(.dark)
        .task { await codexActivity.refresh() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("MONDAY · CODEX COMMAND CENTER", systemImage: "terminal.fill")
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .tracking(1.4)
                .foregroundStyle(MondayDesign.blue)
            Text("Codex, in focus.")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
            Text("A live, read-only view of the work happening on your Mac.")
                .font(.system(size: 14, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .padding(.top, 10)
    }

    private var metrics: some View {
        HStack(spacing: 10) {
            PhoneMetric(value: codexActivity.snapshot.map { "\($0.activeCount)" } ?? "—", label: "CODEX ACTIVE", icon: "terminal.fill", color: MondayDesign.violet)
            PhoneMetric(value: codexActivity.snapshot.map { "\($0.threads.count)" } ?? "—", label: "RECENT TASKS", icon: "clock.arrow.circlepath", color: MondayDesign.blue)
            PhoneMetric(value: codexActivity.isConfigured ? "PAIRED" : "OFFLINE", label: "MAC BRIDGE", icon: "lock.shield.fill", color: MondayDesign.mint)
        }
    }

    private var codexRead: some View {
        PhoneCommandCard(title: "Live work in Codex", eyebrow: "MONDAY ON THIS MAC", icon: "terminal.fill", accent: MondayDesign.violet) {
            if let active = codexActivity.snapshot?.threads.first(where: { $0.status == "active" }) {
                Text(active.title)
                    .font(.system(size: 21, weight: .semibold, design: .rounded))
                Text("Active now in Codex on your Mac.")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
            } else if codexActivity.isLoading {
                ProgressView("Reading Codex activity…")
                    .tint(MondayDesign.violet)
            } else if codexActivity.isConfigured {
                Text("No Codex task is active right now.")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                Text("Recent work remains below; refresh whenever you need the current picture.")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
            } else {
                Text("Codex pairing is not installed in this build.")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                Text("The phone will remain honest about that instead of showing a parallel project list.")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var codexThreadsSection: some View {
        PhoneCommandCard(title: "Recent Codex work", eyebrow: "READ-ONLY ACTIVITY", icon: "clock.arrow.circlepath", accent: MondayDesign.violet) {
            if let threads = codexActivity.snapshot?.threads, !threads.isEmpty {
                ForEach(threads.prefix(6)) { thread in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(thread.status == "active" ? MondayDesign.mint : MondayDesign.violet.opacity(0.65))
                            .frame(width: 7, height: 7)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(thread.title)
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                            Text(thread.status == "active" ? "Active now" : "Updated \(thread.updatedAt, style: .relative)")
                                .font(.system(size: 11, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    if thread.id != threads.prefix(6).last?.id {
                        Divider().overlay(.white.opacity(0.08))
                    }
                }
            } else if let errorMessage = codexActivity.errorMessage {
                Text(errorMessage)
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
            } else {
                Text("No Codex sessions are available yet.")
                    .font(.system(size: 13, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var evidenceBoundary: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.shield.fill").foregroundStyle(MondayDesign.mint)
            VStack(alignment: .leading, spacing: 3) {
                Text("Evidence boundary")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                Text("This app has no phone-local MONDAY workspace. It reads Codex task titles and live session timestamps from your Mac, and it cannot alter Codex work or invent project status.")
                    .font(.system(size: 11, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(.white.opacity(0.08), lineWidth: 1))
    }
}

private enum MondayCommandCenterPalette {
    static let background = LinearGradient(
        colors: [Color(red: 0.016, green: 0.024, blue: 0.043), Color(red: 0.033, green: 0.054, blue: 0.092)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

private struct PhoneMetric: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).foregroundStyle(color)
            Text(value).font(.system(size: 21, weight: .bold, design: .rounded))
            Text(label).font(.system(size: 8, weight: .bold, design: .rounded)).tracking(0.9).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
        .padding(12)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 15))
        .overlay(RoundedRectangle(cornerRadius: 15).stroke(.white.opacity(0.10), lineWidth: 1))
    }
}

private struct PhoneCommandCard<Content: View>: View {
    let title: String
    let eyebrow: String
    let icon: String
    let accent: Color
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(eyebrow).font(.system(size: 9, weight: .bold, design: .rounded)).tracking(1.2).foregroundStyle(accent)
                    Text(title).font(.system(size: 17, weight: .semibold, design: .rounded))
                }
                Spacer()
                Image(systemName: icon).foregroundStyle(accent).frame(width: 34, height: 34).background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
            }
            content
        }
        .padding(16)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.10), lineWidth: 1))
    }
}
