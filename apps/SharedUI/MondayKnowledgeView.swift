import MONDAYCore
import SwiftUI

@MainActor
final class MondayKnowledgeModel: ObservableObject {
    @Published private(set) var notes: [KnowledgeNote] = []
    @Published private(set) var location: KnowledgeStorageLocation = .local
    @Published private(set) var rootURL: URL?
    @Published var query = ""
    @Published var selectedTag: String?
    @Published var selectedNoteID: UUID?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let store: MondayKnowledgeStore

    init(store: MondayKnowledgeStore = MondayKnowledgeStore()) {
        self.store = store
    }

    var visibleNotes: [KnowledgeNote] { KnowledgeQuery.search(notes, query: query, tag: selectedTag) }
    var tags: [String] { Array(Set(notes.filter { !$0.isDeleted }.flatMap(\.tags))).sorted() }
    var activeCount: Int { notes.filter { !$0.isDeleted }.count }

    func start() async {
        isLoading = true
        defer { isLoading = false }
        do { apply(try await store.bootstrapIfEmpty()) } catch { errorMessage = error.localizedDescription }
    }

    func refresh() async {
        do { apply(try await store.load()) } catch { errorMessage = error.localizedDescription }
    }

    @discardableResult
    func createNote(title: String = "Untitled Note", source: KnowledgeNoteSource = .user, tags: [String] = []) async -> KnowledgeNote? {
        do {
            let saved = try await store.upsert(KnowledgeNote(title: title, tags: tags, source: source))
            await refresh()
            selectedNoteID = saved.id
            return saved
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func openDailyNote() async {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        let title = formatter.string(from: .now)
        if let existing = notes.first(where: { !$0.isDeleted && $0.title == title }) {
            selectedNoteID = existing.id
        } else {
            _ = await createNote(title: title, source: .daily, tags: ["daily"])
        }
    }

    func save(_ note: KnowledgeNote) async {
        do {
            let saved = try await store.upsert(note)
            if let index = notes.firstIndex(where: { $0.id == saved.id }) { notes[index] = saved } else { notes.append(saved) }
            notes = KnowledgeQuery.search(notes, query: "")
            await MondaySiriBridge.refreshIndex()
            if note.revision <= 1 {
                await MondaySiriDonations.knowledge(title: saved.title, content: saved.body)
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func delete(_ note: KnowledgeNote) async {
        do {
            _ = try await store.tombstone(note)
            if selectedNoteID == note.id { selectedNoteID = nil }
            await refresh()
            await MondaySiriBridge.refreshIndex()
        } catch { errorMessage = error.localizedDescription }
    }

    func note(id: UUID?) -> KnowledgeNote? { notes.first { $0.id == id && !$0.isDeleted } }
    func backlinks(to note: KnowledgeNote) -> [KnowledgeNote] { KnowledgeQuery.backlinks(to: note, in: notes) }
    func linkedNote(named name: String) -> KnowledgeNote? {
        notes.first { !$0.isDeleted && ([$0.title] + $0.aliases).contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) }
    }

    private func apply(_ snapshot: KnowledgeSnapshot) {
        notes = snapshot.notes
        location = snapshot.location
        rootURL = snapshot.rootURL
        if selectedNoteID == nil { selectedNoteID = notes.first(where: { !$0.isDeleted })?.id }
    }
}

struct MondayKnowledgeView: View {
    @ObservedObject var library: MondayKnowledgeModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationSplitView {
            knowledgeSidebar
                .navigationTitle("Knowledge")
        } content: {
            knowledgeList
                .navigationTitle(library.selectedTag ?? "All Notes")
        } detail: {
            if let note = library.note(id: library.selectedNoteID) {
                MondayKnowledgeEditor(note: note, library: library)
                    .id(note.id)
            } else {
                ContentUnavailableView("Choose a note", systemImage: "note.text", description: Text("Capture an idea or open today's note."))
            }
        }
        .searchable(text: $library.query, prompt: "Search every note")
        .toolbar {
            ToolbarItemGroup {
                Button { Task { await library.openDailyNote() } } label: { Label("Daily Note", systemImage: "calendar") }
                Button { Task { await library.createNote() } } label: { Label("New Note", systemImage: "square.and.pencil") }
                Button("Done") { dismiss() }
            }
        }
        .task { if library.notes.isEmpty { await library.start() } }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await library.refresh() } } }
        .alert("Knowledge needs attention", isPresented: Binding(
            get: { library.errorMessage != nil },
            set: { if !$0 { library.errorMessage = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(library.errorMessage ?? "Unknown error") }
    }

    private var knowledgeSidebar: some View {
        List {
            Section {
                Button { library.selectedTag = nil } label: {
                    Label("All Notes", systemImage: "books.vertical.fill")
                        .badge(library.activeCount)
                }
                Button { Task { await library.openDailyNote() } } label: { Label("Daily Notes", systemImage: "calendar") }
            }
            Section("Tags") {
                ForEach(library.tags, id: \.self) { tag in
                    Button { library.selectedTag = tag } label: { Label(tag, systemImage: "number") }
                }
            }
            Section("Storage") {
                Label(library.location.displayName, systemImage: library.location == .iCloud ? "icloud.fill" : "externaldrive.fill")
                    .foregroundStyle(library.location == .iCloud ? MondayDesign.mint : .secondary)
                Text("Markdown + JSON index")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .listStyle(.sidebar)
    }

    private var knowledgeList: some View {
        List(selection: $library.selectedNoteID) {
            ForEach(library.visibleNotes) { note in
                NavigationLink(value: note.id) {
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            if note.isPinned { Image(systemName: "pin.fill").foregroundStyle(MondayDesign.violet) }
                            if note.source == .obsidian { Image(systemName: "link.icloud.fill").foregroundStyle(MondayDesign.mint) }
                            Text(note.title.isEmpty ? "Untitled Note" : note.title).font(.headline).lineLimit(1)
                        }
                        Text(note.body.replacingOccurrences(of: "\n", with: " "))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        HStack(spacing: 7) {
                            ForEach(note.tags.prefix(3), id: \.self) { Text("#\($0)").font(.caption2).foregroundStyle(MondayDesign.blue) }
                            Spacer()
                            if !note.links.isEmpty { Label("\(note.links.count)", systemImage: "link").font(.caption2).foregroundStyle(.tertiary) }
                        }
                    }
                    .padding(.vertical, 5)
                }
                .tag(note.id)
            }
        }
        .overlay {
            if library.visibleNotes.isEmpty {
                ContentUnavailableView.search(text: library.query)
            }
        }
        .refreshable { await library.refresh() }
    }
}

private struct MondayKnowledgeEditor: View {
    let note: KnowledgeNote
    @ObservedObject var library: MondayKnowledgeModel
    @State private var title = ""
    @State private var bodyText = ""
    @State private var tagsText = ""
    @State private var isPinned = false
    @State private var saveTask: Task<Void, Never>?

    private var links: [String] { KnowledgeLinks.extract(from: bodyText) }
    private var backlinks: [KnowledgeNote] { library.backlinks(to: note) }
    private var isVaultContext: Bool { note.source == .obsidian }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                TextField("Note title", text: $title)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .textFieldStyle(.plain)
                    .disabled(isVaultContext)
                if let provenance = note.provenance {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Reviewed vault context", systemImage: "checkmark.shield.fill")
                            .font(.headline)
                            .foregroundStyle(MondayDesign.mint)
                        Text(provenance.sourceLink)
                            .font(.system(.caption, design: .monospaced))
                        Text("\(provenance.evidenceTier.capitalized) evidence · \(provenance.confidence.rawValue.capitalized) confidence · accepted \(provenance.acceptedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Read-only here. Update or revoke it from the canonical Obsidian source on Mac.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .background(MondayDesign.mint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }
                HStack {
                    Label("Revision \(note.revision)", systemImage: "clock.arrow.circlepath")
                    Text("Edited \(note.modifiedAt.formatted(date: .abbreviated, time: .shortened))")
                    Spacer()
                    Button { isPinned.toggle(); scheduleSave() } label: { Image(systemName: isPinned ? "pin.fill" : "pin") }
                        .disabled(isVaultContext)
                }
                .font(.caption).foregroundStyle(.secondary)

                TextEditor(text: $bodyText)
                    .font(.system(.body, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 360)
                    .padding(12)
                    .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
                    .disabled(isVaultContext)
                TextField("Tags, separated by commas", text: $tagsText)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isVaultContext)

                if !links.isEmpty || !backlinks.isEmpty {
                    Divider()
                    Text("Connections").font(.headline)
                    ForEach(links, id: \.self) { link in
                        Button { library.selectedNoteID = library.linkedNote(named: link)?.id } label: {
                            Label(link, systemImage: library.linkedNote(named: link) == nil ? "link.badge.plus" : "arrow.up.right")
                        }
                        .buttonStyle(.plain)
                        .disabled(library.linkedNote(named: link) == nil)
                    }
                    ForEach(backlinks) { source in
                        Button { library.selectedNoteID = source.id } label: { Label("Linked from \(source.title)", systemImage: "arrow.uturn.backward") }
                            .buttonStyle(.plain)
                    }
                }
            }
            .padding(24)
        }
        .navigationTitle("")
        .toolbar {
            if !isVaultContext {
                ToolbarItemGroup {
                    Button { Task { await save() } } label: { Image(systemName: "checkmark") }
                        .accessibilityLabel("Save note")
                    Button(role: .destructive) { Task { await library.delete(note) } } label: { Image(systemName: "trash") }
                }
            }
        }
        .onAppear { load() }
        .onChange(of: title) { scheduleSave() }
        .onChange(of: bodyText) { scheduleSave() }
        .onChange(of: tagsText) { scheduleSave() }
        .onDisappear { saveTask?.cancel(); Task { await save() } }
    }

    private func load() {
        title = note.title
        bodyText = note.body
        tagsText = note.tags.joined(separator: ", ")
        isPinned = note.isPinned
    }

    private func scheduleSave() {
        guard !isVaultContext else { return }
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(650))
            guard !Task.isCancelled else { return }
            await save()
        }
    }

    private func save() async {
        guard !isVaultContext else { return }
        var changed = note
        changed.title = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Untitled Note" : title
        changed.body = bodyText
        changed.tags = tagsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        changed.isPinned = isPinned
        guard changed.title != note.title || changed.body != note.body || changed.tags != note.tags || changed.isPinned != note.isPinned else { return }
        await library.save(changed)
    }
}
