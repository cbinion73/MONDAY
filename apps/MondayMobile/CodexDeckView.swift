import Foundation
import SwiftUI
import UIKit

private enum CodexDeckTab: String, CaseIterable, Identifiable {
    case command = "Command"
    case projects = "Projects"
    case books = "Books"
    case log = "Captain's Log"
    case researchJournal = "Research Journal"
    case chapel = "Chapel"
    case beads = "Prayer Beads"
    case study = "Bible Study"
    case planner = "Planner"

    var id: String { rawValue }
    var icon: String {
        switch self {
        case .command: "terminal.fill"
        case .projects: "square.stack.3d.up.fill"
        case .books: "books.vertical.fill"
        case .log: "book.closed.fill"
        case .researchJournal: "text.book.closed.fill"
        case .chapel: "flame.fill"
        case .beads: "circle.hexagongrid.fill"
        case .study: "cross.case.fill"
        case .planner: "calendar"
        }
    }
}

struct CodexDeckView: View {
    @State private var selection: CodexDeckTab = .command

    var body: some View {
        ZStack {
            DeckPalette.background.ignoresSafeArea()
            VStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(CodexDeckTab.allCases) { tab in
                            Button { selection = tab } label: {
                                Label(tab.rawValue, systemImage: tab.icon)
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                                    .foregroundStyle(selection == tab ? .black : .white.opacity(0.72))
                                    .padding(.horizontal, 13)
                                    .padding(.vertical, 9)
                                    .background(selection == tab ? DeckPalette.accent : .white.opacity(0.07), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }
                Divider().overlay(.white.opacity(0.10))
                Group {
                    switch selection {
                    case .command: MobileCommandCenterView()
                    case .projects: CodexProjectsView()
                    case .books: VaultReaderView(collection: .books)
                    case .log: CaptainLogView()
                    case .researchJournal: VaultReaderView(collection: .researchJournal)
                    case .chapel: ChapelView()
                    case .beads: PrayerBeadsView()
                    case .study: VaultReaderView(collection: .bibleStudies)
                    case .planner: PlannerView()
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

private enum VaultCollection: String {
    case books = "books"
    case captainsLog = "captains-log"
    case researchJournal = "research-journal"
    case bibleStudies = "bible-studies"

    var title: String {
        switch self {
        case .books: "Books & Publishing"
        case .captainsLog: "Captain's Log"
        case .researchJournal: "Research Journal"
        case .bibleStudies: "Bible Studies"
        }
    }

    var eyebrow: String {
        switch self {
        case .books: "PERSONAL KNOWLEDGE VAULT"
        case .captainsLog: "MONDAY VAULT · READ ONLY"
        case .researchJournal: "MONDAY VAULT · GOVERNED BUILD RECORD"
        case .bibleStudies: "MONDAY VAULT · READ ONLY"
        }
    }
}

private struct LibraryListResponse: Decodable { let entries: [VaultDocumentSummary] }
private struct VaultDocumentSummary: Decodable, Identifiable {
    let id: String
    let title: String
    let updatedAt: Date
    let preview: String
}
private struct VaultDocument: Decodable, Identifiable {
    let id: String
    let title: String
    let updatedAt: Date
    let body: String
}

@MainActor
private final class CodexLibraryFeed: ObservableObject {
    @Published private(set) var entries: [VaultDocumentSummary] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let collection: VaultCollection
    private let endpoint: URL?
    private let token: String?

    init(collection: VaultCollection) {
        self.collection = collection
        let urlString = Bundle.main.object(forInfoDictionaryKey: "CodexActivityBridgeURL") as? String
        let token = Bundle.main.object(forInfoDictionaryKey: "CodexActivityBridgeToken") as? String
        endpoint = urlString.flatMap(URL.init(string:))
        self.token = token?.isEmpty == false ? token : nil
    }

    func refresh() async {
        guard let endpoint, let token else { errorMessage = "This build is not paired with your Mac."; return }
        isLoading = true
        defer { isLoading = false }
        do {
            let data = try await request(endpoint.appendingPathComponent("v1/library/\(collection.rawValue)"), token: token)
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            entries = try decoder.decode(LibraryListResponse.self, from: data).entries
            errorMessage = nil
        } catch { errorMessage = "This Mac library is not reachable right now." }
    }

    func load(_ entry: VaultDocumentSummary) async -> VaultDocument? {
        guard let endpoint, let token else { return nil }
        do {
            let data = try await request(endpoint.appendingPathComponent("v1/library/\(collection.rawValue)/\(entry.id)"), token: token)
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(VaultDocument.self, from: data)
        } catch { return nil }
    }

    func capture(_ text: String) async -> Bool {
        guard let endpoint, let token, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        do {
            var request = URLRequest(url: endpoint.appendingPathComponent("v1/captains-log-capture"))
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["content": text])
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 201
        } catch { return false }
    }

    private func request(_ url: URL, token: String) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 8
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return data
    }
}

private struct CodexProjectsView: View {
    @StateObject private var feed = CodexActivityFeed()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DeckHeading(eyebrow: "CODEX PROJECT ACTIVITY", title: "Projects I’m holding with you", detail: "Directly from the Codex session index on your Mac.")
                if feed.isLoading { ProgressView("Reading Codex…").tint(DeckPalette.accent) }
                ForEach(feed.snapshot?.threads ?? []) { task in
                    DeckCard {
                        HStack(alignment: .top, spacing: 12) {
                            Circle().fill(task.status == "active" ? DeckPalette.green : DeckPalette.accent.opacity(0.75)).frame(width: 9, height: 9).padding(.top, 5)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(task.title).font(.system(size: 17, weight: .semibold, design: .rounded))
                                Text(task.status == "active" ? "Active in Codex now" : "Updated \(task.updatedAt, style: .relative)").font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    }
                }
                if let error = feed.errorMessage { DeckEmpty(message: error) }
            }.padding(18)
        }
        .task { await feed.refresh() }
    }
}

private struct VaultReaderView: View {
    let collection: VaultCollection
    @StateObject private var feed: CodexLibraryFeed
    @State private var document: VaultDocument?
    @State private var isLoadingDocument = false

    init(collection: VaultCollection) {
        self.collection = collection
        _feed = StateObject(wrappedValue: CodexLibraryFeed(collection: collection))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DeckHeading(eyebrow: collection.eyebrow, title: collection.title, detail: "Read from the source Markdown on your Mac.")
                    if feed.isLoading { ProgressView("Opening library…").tint(DeckPalette.accent) }
                    ForEach(feed.entries) { entry in
                        Button {
                            Task { isLoadingDocument = true; document = await feed.load(entry); isLoadingDocument = false }
                        } label: {
                            DeckCard {
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(entry.title).font(.system(size: 17, weight: .semibold, design: .rounded)).foregroundStyle(.white)
                                    Text(entry.preview.replacingOccurrences(of: "\n", with: " ")).lineLimit(2).font(.system(size: 12, design: .serif)).foregroundStyle(.white.opacity(0.56))
                                    Text(entry.updatedAt, style: .date).font(.system(size: 10, weight: .bold, design: .rounded)).foregroundStyle(DeckPalette.accent)
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                    if let error = feed.errorMessage { DeckEmpty(message: error) }
                }.padding(18)
            }
            .sheet(item: $document) { document in TomeDocumentView(document: document) }
        }
        .task { await feed.refresh() }
    }
}

private struct CaptainLogView: View {
    @StateObject private var feed = CodexLibraryFeed(collection: .captainsLog)
    @State private var document: VaultDocument?
    @State private var capture = ""
    @State private var captureResult: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DeckHeading(eyebrow: "MONDAY JOURNAL", title: "Captain’s Log", detail: "Read your recorded days and capture a private draft for Codex.")
                    DeckCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Capture for Codex").font(.system(size: 17, weight: .semibold, design: .rounded))
                            TextEditor(text: $capture).frame(minHeight: 118).scrollContentBackground(.hidden).padding(8).background(.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 10))
                            Button("Capture privately") {
                                Task {
                                    let saved = await feed.capture(capture)
                                    if saved { capture = ""; captureResult = "Captured on your Mac for Codex review. It has not been turned into a journal entry." }
                                    else { captureResult = "Capture could not reach your Mac." }
                                }
                            }.buttonStyle(.borderedProminent).tint(DeckPalette.accent)
                            if let captureResult { Text(captureResult).font(.system(size: 11)).foregroundStyle(.secondary) }
                        }
                    }
                    Text("Recorded days").font(.system(size: 19, weight: .semibold, design: .rounded))
                    ForEach(feed.entries) { entry in
                        Button { Task { document = await feed.load(entry) } } label: {
                            DeckCard { VStack(alignment: .leading, spacing: 4) { Text(entry.title).font(.system(size: 16, weight: .semibold, design: .rounded)).foregroundStyle(.white); Text(entry.updatedAt, style: .date).font(.system(size: 11)).foregroundStyle(.secondary) } }
                        }.buttonStyle(.plain)
                    }
                }.padding(18)
            }.sheet(item: $document) { TomeDocumentView(document: $0) }
        }.task { await feed.refresh() }
    }
}

private struct TomeDocumentView: View {
    let document: VaultDocument
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(document.title).font(.system(size: 31, weight: .semibold, design: .serif)).foregroundStyle(JournalPalette.primary)
                    Text(document.updatedAt, style: .date).font(.system(size: 12, weight: .semibold)).foregroundStyle(JournalPalette.muted)
                    MarkdownTomeText(source: document.body)
                }
                .padding(26)
                .background(JournalPalette.page, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(16)
            }
            .background(JournalPalette.background.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct MarkdownTomeText: View {
    let source: String
    private var paragraphs: [String] { source.components(separatedBy: "\n\n").filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, raw in
                let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if line.hasPrefix("#") {
                    Text(line.trimmingCharacters(in: CharacterSet(charactersIn: "# "))).font(.system(size: 21, weight: .semibold, design: .serif)).foregroundStyle(JournalPalette.primary)
                } else if line.hasPrefix(">") {
                    Text(line.dropFirst().trimmingCharacters(in: .whitespaces)).italic().font(.system(size: 17, design: .serif)).foregroundStyle(JournalPalette.secondary).padding(.leading, 12).overlay(alignment: .leading) { Capsule().fill(JournalPalette.accent).frame(width: 3) }
                } else {
                    Text(markdown(line)).font(.system(size: 17, design: .serif)).foregroundStyle(JournalPalette.primary).lineSpacing(6)
                }
            }
        }
    }
    private func markdown(_ source: String) -> AttributedString { (try? AttributedString(markdown: source, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(source) }
}

private struct ChapelView: View {
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer()
                ChronicleCandleView().frame(width: 300, height: 330)
                Text("The Chapel").font(.system(size: 34, weight: .semibold, design: .serif))
                Text("“The Lord is near unto all them that call upon him.” — Psalm 145:18, KJV").font(.system(size: 15, design: .serif)).foregroundStyle(DeckPalette.gold).multilineTextAlignment(.center).padding(.horizontal, 24)
                Text("A quiet place. No streaks. No progress meter.").font(.system(size: 12)).foregroundStyle(.white.opacity(0.5))
                Spacer()
            }
        }
    }
}

private struct ChronicleCandleView: View {
    private let candle = Bundle.main.url(forResource: "chronicle-candle", withExtension: "png")
        .flatMap { UIImage(contentsOfFile: $0.path) }
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24.0)) { timeline in
            let pulse = 0.985 + sin(timeline.date.timeIntervalSinceReferenceDate * 2.7) * 0.012
            ZStack {
                if let candle { Image(uiImage: candle).resizable().scaledToFit() }
                if let candle {
                    Image(uiImage: candle).resizable().scaledToFit().scaleEffect(x: pulse, y: pulse + 0.016, anchor: .bottom).opacity(0.82).mask(Ellipse().frame(width: 44, height: 108).offset(y: -84))
                }
            }
        }
        .accessibilityLabel("Chronicle candle with a gently flickering flame")
    }
}

private struct PrayerBeadsView: View {
    @State private var step = 0
    private let images = ["large-cross", "ruby", "emerald", "sapphire", "diamond", "silver-cross", "centerpiece", "jasper"]
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                DeckHeading(eyebrow: "ACTS 4:13", title: "Scripture Prayer Beads", detail: "The original bead artwork, with space to pray at your own pace.")
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 11) { ForEach(images.indices, id: \.self) { index in Button { step = index } label: { BeadImage(name: images[index]).frame(width: 45, height: 45).padding(5).background(index == step ? DeckPalette.accent.opacity(0.18) : .clear, in: Circle()).overlay(Circle().stroke(index == step ? DeckPalette.accent : .white.opacity(0.16), lineWidth: 1.5)) }.buttonStyle(.plain) } }.padding(.horizontal, 18) }
                BeadImage(name: images[step]).frame(width: 170, height: 170)
                Text("Bead \(step + 1)").font(.system(size: 23, weight: .semibold, design: .serif))
                Text("This companion keeps the actual Acts 4:13 bead imagery close while you pray. It does not replace the complete Scripture Beads path.").font(.system(size: 15, design: .serif)).foregroundStyle(.white.opacity(0.65)).multilineTextAlignment(.center).padding(.horizontal, 34)
                HStack { Button("Previous") { step = max(0, step - 1) }.buttonStyle(.bordered).disabled(step == 0); Button("Next bead") { step = min(images.count - 1, step + 1) }.buttonStyle(.borderedProminent).tint(DeckPalette.accent).disabled(step == images.count - 1) }
            }.padding(.vertical, 28)
        }
    }
}

private struct BeadImage: View {
    let name: String
    var body: some View { Group { if let url = Bundle.main.url(forResource: name, withExtension: "webp"), let image = UIImage(contentsOfFile: url.path) { Image(uiImage: image).resizable().scaledToFit() } else { Circle().fill(DeckPalette.gold) } } }
}

private struct PlannerResponse: Decodable { let status: String; let plan: DailyPlannerPlan? }
private struct DailyPlannerPlan: Decodable {
    let date: String
    let generatedAt: Date
    let timezone: String
    let sources: [PlannerSource]
    let primaryFocus: String
    let schedule: [PlannerScheduleItem]
    let priorities: PlannerPriorities
    let notes: [String]
    let compass: [PlannerCompassItem]
}
private struct PlannerSource: Decodable { let kind: String; let name: String; let status: String; let fetchedAt: Date }
private struct PlannerScheduleItem: Decodable { let time: String; let end: String; let title: String }
private struct PlannerPriorities: Decodable { let a: [String]; let b: [String]; let c: [String] }
private struct PlannerCompassItem: Decodable { let role: String; let goal: String }

@MainActor
private final class DailyPlannerFeed: ObservableObject {
    @Published private(set) var plan: DailyPlannerPlan?
    @Published private(set) var message = "Reading today's MONDAY plan…"

    private let endpoint: URL?
    private let token: String?

    init() {
        let urlString = Bundle.main.object(forInfoDictionaryKey: "CodexActivityBridgeURL") as? String
        let configuredToken = Bundle.main.object(forInfoDictionaryKey: "CodexActivityBridgeToken") as? String
        endpoint = urlString.flatMap(URL.init(string:))
        token = configuredToken?.isEmpty == false ? configuredToken : nil
    }

    func refresh() async {
        guard let endpoint, let token else { message = "This build is not paired with your Mac."; return }
        do {
            var request = URLRequest(url: endpoint.appendingPathComponent("v1/planner/today"))
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 8
            let (data, httpResponse) = try await URLSession.shared.data(for: request)
            guard (httpResponse as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(PlannerResponse.self, from: data)
            plan = decoded.plan
            message = decoded.plan == nil ? "MONDAY has not prepared today's plan yet." : "Prepared \(decoded.plan!.generatedAt.formatted(.dateTime.hour().minute()))."
        } catch { message = "Today's MONDAY plan is not reachable right now." }
    }
}

private extension PlannerPageData {
    init(_ source: DailyPlannerPlan) {
        self.init(
            date: source.date,
            generatedAt: source.generatedAt,
            timezone: source.timezone,
            sources: source.sources.map {
                PlannerPageSource(kind: $0.kind, name: $0.name, status: $0.status, fetchedAt: $0.fetchedAt)
            },
            primaryFocus: source.primaryFocus,
            schedule: source.schedule.map {
                PlannerPageScheduleItem(time: $0.time, end: $0.end, title: $0.title)
            },
            priorities: PlannerPagePriorities(a: source.priorities.a, b: source.priorities.b, c: source.priorities.c),
            notes: source.notes,
            compass: source.compass.map {
                PlannerPageCompassItem(role: $0.role, goal: $0.goal)
            }
        )
    }
}

private struct PlannerView: View {
    @StateObject private var feed = DailyPlannerFeed()

    var body: some View {
        MondayPlannerPageView(
            plan: feed.plan.map(PlannerPageData.init),
            statusMessage: feed.message
        )
        .task { await feed.refresh() }
    }
}

private struct PlannerScheduleColumn: View {
    let plan: DailyPlannerPlan?
    private var schedule: [PlannerScheduleItem] { (plan?.schedule ?? []).sorted { $0.time < $1.time } }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerSectionTitle(title: "SCHEDULE", detail: "LOCAL TIME / ONE SOURCE")
            Text(plan == nil ? "No normalized MONDAY plan is available yet." : "Fixed commitments and intentional focus blocks in \(plan?.timezone ?? "local") time.")
                .font(.system(size: 9, design: .serif))
                .foregroundStyle(DeckPalette.ink.opacity(0.62))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            if schedule.isEmpty {
                Text("No scheduled events were returned by the normalized planner payload.").font(.system(size: 10, design: .serif)).foregroundStyle(DeckPalette.ink.opacity(0.62)).padding(.horizontal, 12).padding(.bottom, 14)
            } else {
                ForEach(Array(schedule.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 5) {
                        Text("\(displayTime(item.time))–\(displayTime(item.end))").font(.system(size: 8, weight: .bold, design: .rounded)).frame(width: 80, alignment: .trailing)
                        Text(item.title).font(.system(size: 10, design: .serif)).fixedSize(horizontal: false, vertical: true)
                    }
                    .foregroundStyle(DeckPalette.ink).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 10).padding(.vertical, 4)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    private func displayTime(_ time: String) -> String { let pieces = time.split(separator: ":"); guard let hour = Int(pieces[0]), let minute = pieces.last else { return time }; let shown = hour > 12 ? hour - 12 : hour; return "\(shown):\(minute) \(hour >= 12 ? "PM" : "AM")" }
}

private struct PlannerTaskColumn: View {
    let plan: DailyPlannerPlan?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerSectionTitle(title: "PRIORITIZED DAILY TASK LIST", detail: "A / B / C")
            ForEach(0..<12, id: \.self) { index in
                let item = priority(at: index)
                HStack(spacing: 7) {
                    Text(priority(at: index) == nil ? "" : priorityLabel(at: index))
                        .font(.system(size: 9, weight: .black, design: .rounded))
                        .foregroundStyle(DeckPalette.ink.opacity(0.62))
                        .frame(width: 22)
                    if let item { Text(item).font(.system(size: 10, design: .serif)).lineLimit(1) } else { Rectangle().fill(DeckPalette.ink.opacity(0.20)).frame(height: 1) }
                }
                .frame(height: 30)
                .padding(.horizontal, 11)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func priority(at index: Int) -> String? {
        let items = (plan?.priorities.a ?? []) + (plan?.priorities.b ?? []) + (plan?.priorities.c ?? [])
        return items.indices.contains(index) ? items[index] : nil
    }
    private func priorityLabel(at index: Int) -> String { let a = plan?.priorities.a.count ?? 0; let b = plan?.priorities.b.count ?? 0; if index < a { return "A\(index + 1)" }; if index < a + b { return "B\(index - a + 1)" }; return "C\(index - a - b + 1)" }
}

private struct PlannerNotesColumn: View {
    let plan: DailyPlannerPlan?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerSectionTitle(title: "NOTES & IDEAS", detail: "CAPTURE")
            ForEach(0..<7, id: \.self) { index in
                if let note = plan?.notes.indices.contains(index) == true ? plan?.notes[index] : nil {
                    Text(note).font(.system(size: 10, design: .serif)).lineLimit(2).foregroundStyle(DeckPalette.ink).padding(.horizontal, 12).frame(minHeight: 25, alignment: .leading)
                } else { Rectangle().fill(DeckPalette.ink.opacity(0.18)).frame(height: 1).padding(.horizontal, 12).frame(height: 25) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct PlannerCompassColumn: View {
    let plan: DailyPlannerPlan?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerSectionTitle(title: "DAILY COMPASS", detail: "ROLES / GOALS")
            ForEach(0..<4, id: \.self) { index in
                let item = plan?.compass.indices.contains(index) == true ? plan?.compass[index] : nil
                VStack(alignment: .leading, spacing: 5) {
                    HStack { Text("ROLE").font(.system(size: 8, weight: .bold, design: .rounded)).tracking(0.7); Text(item?.role ?? "").font(.system(size: 10, design: .serif)); Rectangle().fill(DeckPalette.ink.opacity(0.26)).frame(height: 1) }
                    HStack { Text("GOAL").font(.system(size: 8, weight: .bold, design: .rounded)).tracking(0.7); Text(item?.goal ?? "").font(.system(size: 10, design: .serif)); Rectangle().fill(DeckPalette.ink.opacity(0.20)).frame(height: 1) }
                }
                .foregroundStyle(DeckPalette.ink.opacity(0.58))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

private struct PlannerSectionTitle: View {
    let title: String; let detail: String
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 10, weight: .black, design: .rounded)).tracking(0.8)
            Spacer()
            Text(detail).font(.system(size: 8, weight: .bold, design: .rounded)).tracking(0.6).foregroundStyle(DeckPalette.ink.opacity(0.54))
        }
        .foregroundStyle(DeckPalette.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(DeckPalette.ink.opacity(0.07))
    }
}

private struct DeckHeading: View {
    let eyebrow: String; let title: String; let detail: String
    var body: some View { VStack(alignment: .leading, spacing: 7) { Text(eyebrow).font(.system(size: 10, weight: .bold, design: .rounded)).tracking(1.3).foregroundStyle(DeckPalette.accent); Text(title).font(.system(size: 30, weight: .semibold, design: .rounded)); Text(detail).font(.system(size: 14)).foregroundStyle(.secondary) } }
}
private struct DeckCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View { content.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 17)).overlay(RoundedRectangle(cornerRadius: 17).stroke(.white.opacity(0.10), lineWidth: 1)) }
}
private struct DeckEmpty: View { let message: String; var body: some View { Text(message).font(.system(size: 14)).foregroundStyle(.secondary).padding(16) } }
private enum DeckPalette {
    static let background = LinearGradient(colors: [Color(red: 0.016, green: 0.024, blue: 0.043), Color(red: 0.033, green: 0.054, blue: 0.092)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let accent = Color(red: 0.38, green: 0.81, blue: 0.94)
    static let green = Color(red: 0.38, green: 0.84, blue: 0.64)
    static let gold = Color(red: 0.95, green: 0.78, blue: 0.48)
    static let ink = Color(red: 0.17, green: 0.11, blue: 0.065)
    static let tomeBackground = Color(red: 0.08, green: 0.052, blue: 0.03)
}

private enum JournalPalette {
    static let background = LinearGradient(colors: [Color(red: 0.006, green: 0.014, blue: 0.028), Color(red: 0.012, green: 0.037, blue: 0.064)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let page = Color(red: 0.018, green: 0.052, blue: 0.084)
    static let primary = Color(red: 0.88, green: 0.95, blue: 1.0)
    static let secondary = Color(red: 0.68, green: 0.80, blue: 0.89)
    static let muted = Color(red: 0.42, green: 0.63, blue: 0.74)
    static let accent = Color(red: 0.38, green: 0.81, blue: 0.94)
}
