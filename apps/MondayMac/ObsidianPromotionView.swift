import MONDAYCore
import SwiftUI

@MainActor
final class ObsidianPromotionModel: ObservableObject {
    enum Status: String {
        case available = "Not published"
        case current = "Current"
        case updateAvailable = "Review update"
    }

    struct Candidate: Identifiable {
        var id: String { note.relativePath }
        let note: ObsidianVaultNote
        let status: Status
    }

    @Published private(set) var candidates: [Candidate] = []
    @Published var selectedPaths: Set<String> = []
    @Published var query = ""
    @Published private(set) var storageLocation: KnowledgeStorageLocation = .local
    @Published var isWorking = false
    @Published var errorMessage: String?

    private let reader = ObsidianVaultReader(
        rootURL: FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Knowledge Vault/Chris Knowledge", isDirectory: true)
    )
    private let store = MondayKnowledgeStore()

    static let recommendedPaths: Set<String> = [
        "Knowledge/Chris Binion.md",
        "Knowledge/Preferences.md",
        "Knowledge/Relationships.md",
        "Knowledge/Life Plan 2025.md",
        "Knowledge/Daily Rhythm.md",
        "Knowledge/Writing Voice.md",
        "Knowledge/Time Management.md",
        "Monday/Mission.md",
        "Contradictions/Focus vs Opportunity.md",
        "Contradictions/Health vs Schedule.md"
    ]

    var visibleCandidates: [Candidate] {
        guard !query.isEmpty else { return candidates }
        return candidates.filter {
            $0.note.title.localizedCaseInsensitiveContains(query)
                || $0.note.relativePath.localizedCaseInsensitiveContains(query)
                || $0.note.tags.contains(where: { $0.localizedCaseInsensitiveContains(query) })
        }
    }

    var publishableCount: Int {
        candidates.filter { selectedPaths.contains($0.id) && $0.status != .current }.count
    }

    func load(selectRecommended: Bool = false) async {
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await reader.load()
            let vaultNotes = try await reader.allNotes()
            let knowledge = try await store.load()
            storageLocation = knowledge.location
            let promoted = Dictionary(
                uniqueKeysWithValues: knowledge.notes.compactMap { note -> (String, KnowledgeNote)? in
                    guard !note.isDeleted, let path = note.provenance?.sourcePath else { return nil }
                    return (path, note)
                }
            )
            candidates = vaultNotes.map { source in
                let current = promoted[source.relativePath]
                let status: Status
                if let current, current.provenance?.sourceRevisionHash == MondayKnowledgeStore.sha256(source.markdown) {
                    status = .current
                } else if current != nil {
                    status = .updateAvailable
                } else {
                    status = .available
                }
                return Candidate(note: source, status: status)
            }
            if selectRecommended {
                selectedPaths = Self.recommendedPaths.intersection(Set(candidates.filter { $0.status != .current }.map(\.id)))
            } else {
                selectedPaths = selectedPaths.intersection(Set(candidates.map(\.id)))
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectRecommended() {
        selectedPaths = Self.recommendedPaths.intersection(Set(candidates.filter { $0.status != .current }.map(\.id)))
    }

    func publishSelected(to library: MondayKnowledgeModel) async {
        let selected = candidates.filter { selectedPaths.contains($0.id) && $0.status != .current }
        guard !selected.isEmpty else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            for candidate in selected { _ = try await store.promoteObsidian(candidate.note) }
            selectedPaths.removeAll()
            await library.refresh()
            await MondaySiriBridge.refreshIndex()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func revoke(_ candidate: Candidate, from library: MondayKnowledgeModel) async {
        do {
            _ = try await store.revokeObsidian(relativePath: candidate.note.relativePath)
            await library.refresh()
            await MondaySiriBridge.refreshIndex()
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ObsidianPromotionView: View {
    @ObservedObject var library: MondayKnowledgeModel
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model = ObsidianPromotionModel()

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Publish Vault Context")
                        .font(.system(size: 27, weight: .semibold, design: .rounded))
                    Text("Review exactly what iPhone and iPad may receive. Obsidian stays canonical.")
                        .font(.system(size: 11, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }
            }
            .padding(24)

            Divider()

            HStack {
                Label(model.storageLocation.displayName, systemImage: model.storageLocation == .iCloud ? "icloud.fill" : "externaldrive.fill")
                    .foregroundStyle(model.storageLocation == .iCloud ? MondayDesign.mint : .secondary)
                Spacer()
                Button("Core context") { model.selectRecommended() }
                    .buttonStyle(.bordered)
                Button("Publish \(model.publishableCount)") {
                    Task { await model.publishSelected(to: library) }
                }
                .buttonStyle(.borderedProminent)
                .tint(MondayDesign.violet)
                .disabled(model.publishableCount == 0 || model.isWorking)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)

            List(model.visibleCandidates) { candidate in
                HStack(spacing: 12) {
                    Toggle(isOn: Binding(
                        get: { model.selectedPaths.contains(candidate.id) },
                        set: { selected in
                            if selected { model.selectedPaths.insert(candidate.id) }
                            else { model.selectedPaths.remove(candidate.id) }
                        }
                    )) { EmptyView() }
                    .toggleStyle(.checkbox)
                    .disabled(candidate.status == .current)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(candidate.note.title).font(.headline)
                        Text(candidate.note.wikiLink).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(candidate.note.tier.rawValue.capitalized)
                        .font(.caption2).foregroundStyle(.secondary)
                    Text(candidate.status.rawValue)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(candidate.status == .current ? MondayDesign.mint : candidate.status == .updateAvailable ? MondayDesign.rose : .secondary)
                        .frame(width: 96, alignment: .trailing)
                    if candidate.status == .current || candidate.status == .updateAvailable {
                        Button("Revoke", role: .destructive) {
                            Task { await model.revoke(candidate, from: library) }
                        }
                        .buttonStyle(.borderless)
                    }
                }
                .padding(.vertical, 4)
            }
            .searchable(text: $model.query, prompt: "Search curated vault notes")

            Text("Publishing copies reviewed context and provenance—not authority. Source changes wait for another review; revocation syncs as a tombstone.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(16)
        }
        .frame(minWidth: 820, minHeight: 660)
        .task { await model.load(selectRecommended: true) }
        .alert("Vault publication needs attention", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )) { Button("OK", role: .cancel) {} } message: { Text(model.errorMessage ?? "Unknown error") }
    }
}
