import Foundation
import Testing
@testable import MONDAYCore

@Suite("Monday Knowledge")
struct MondayKnowledgeTests {
    @Test("Markdown round trips with machine-readable front matter")
    func markdownRoundTrip() throws {
        let note = KnowledgeNote(
            title: "Golden Line",
            body: "Connect this to [[Midas]] and [[Capacity#This Week]].",
            tags: ["revenue", "decision"],
            aliases: ["The Golden Line"],
            isPinned: true,
            source: .monday
        )
        let codec = KnowledgeDocumentCodec()
        let data = try codec.encode(note)
        let text = String(decoding: data, as: UTF8.self)
        #expect(text.hasPrefix("---\nmonday: {"))
        #expect(text.contains("com.binion.monday.knowledge.note.v1"))
        let decoded = try codec.decode(data)
        #expect(decoded.id == note.id)
        #expect(decoded.title == note.title)
        #expect(decoded.body == note.body)
        #expect(decoded.tags == note.tags)
        #expect(decoded.aliases == note.aliases)
        #expect(decoded.isPinned == note.isPinned)
        #expect(decoded.source == note.source)
        #expect(abs(decoded.createdAt.timeIntervalSince(note.createdAt)) < 0.001)
        #expect(abs(decoded.modifiedAt.timeIntervalSince(note.modifiedAt)) < 0.001)
    }

    @Test("Wiki links and backlinks form a deterministic graph")
    func graph() {
        let target = KnowledgeNote(title: "Midas", aliases: ["Revenue Engine"])
        let linked = KnowledgeNote(title: "Book Idea", body: "Send this to [[Revenue Engine|Midas]].")
        let unrelated = KnowledgeNote(title: "Packing List", body: "Remember the charger.")
        #expect(linked.links == ["Revenue Engine"])
        #expect(KnowledgeQuery.backlinks(to: target, in: [target, linked, unrelated]).map(\.id) == [linked.id])
        #expect(KnowledgeLinks.extract(from: "Use `[[Example]]`, then open [[Real Note]].") == ["Real Note"])
    }

    @Test("Search ranks titles and tags ahead of body-only matches")
    func searchRanking() {
        let title = KnowledgeNote(title: "Scout Calendar", body: "Saturday")
        let tag = KnowledgeNote(title: "Weekend", body: "Saturday", tags: ["scout"])
        let body = KnowledgeNote(title: "Errands", body: "Pick up scout supplies")
        let result = KnowledgeQuery.search([body, tag, title], query: "scout")
        #expect(result.map(\.id) == [title.id, tag.id, body.id])
    }

    @Test("Store writes Markdown, JSON index, revisions, and deletion tombstones")
    func fileStore() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("monday-knowledge-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = MondayKnowledgeStore(containerIdentifier: "invalid.test.container", localRootURL: root)
        let original = KnowledgeNote(title: "Decision", body: "Choose the native path.")
        let first = try await store.upsert(original)
        #expect(first.revision == 1)
        #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent("knowledge-index-v1.json").path))
        #expect((try await store.load()).notes.first?.title == "Decision")

        var edited = first
        edited.body = "Choose the Apple-native path."
        let second = try await store.upsert(edited)
        #expect(second.revision == 2)
        let deleted = try await store.tombstone(second)
        #expect(deleted.isDeleted)
        #expect(KnowledgeQuery.search((try await store.load()).notes, query: "").isEmpty)
    }
}
