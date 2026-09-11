import Foundation
import Testing
@testable import MONDAYCore

@Suite("Governed Obsidian retrieval")
struct ObsidianVaultTests {
    @Test("Indexes curated evidence and excludes raw or proposed material")
    func curatedBoundary() async throws {
        let root = try temporaryVault()
        try write("# Chris Binion\nBuilder and thinking partner.", to: root.appendingPathComponent("Knowledge/Chris Binion.md"))
        try write("# Raw transcript\nChris said many things.", to: root.appendingPathComponent("MeGPT/Corpus/Text-synced/raw.md"))
        try write("# Proposed profile\nUnreviewed claim.", to: root.appendingPathComponent("MeGPT/Review/proposal.md"))

        let reader = ObsidianVaultReader(rootURL: root)
        let snapshot = try await reader.load()

        #expect(snapshot.indexedNotes == 1)
        #expect(snapshot.excludedFiles == 2)
        #expect(try await reader.search("Who am I?").first?.note.relativePath == "Knowledge/Chris Binion.md")
    }

    @Test("Ranks title and canonical identity evidence ahead of synthesis")
    func ranking() async throws {
        let root = try temporaryVault()
        try write(
            "---\ntags: [identity, chris]\ntype: identity\n---\n# Chris Binion\nChris turns ambiguity into useful action.",
            to: root.appendingPathComponent("Knowledge/Chris Binion.md")
        )
        try write(
            "---\ntags: [megpt, identity]\ntype: synthesis\n---\n# Leadership Synthesis\nA synthesis about Chris and leadership.",
            to: root.appendingPathComponent("MeGPT/Synthesis/Leadership Synthesis.md")
        )

        let matches = try await ObsidianVaultReader(rootURL: root).search("Who am I and how do I lead?", limit: 2)

        #expect(matches.count == 2)
        #expect(matches[0].note.relativePath == "Knowledge/Chris Binion.md")
        #expect(matches[0].note.wikiLink == "[[Knowledge/Chris Binion]]")
    }

    @Test("Promotion is provenance-linked, idempotent, review-gated, and revocable")
    func promotionLifecycle() async throws {
        let root = try temporaryVault()
        try write(
            "---\ntags: [identity, chris]\ntype: identity\n---\n# Chris Binion\nCanonical profile.",
            to: root.appendingPathComponent("Knowledge/Chris Binion.md")
        )
        let reader = ObsidianVaultReader(rootURL: root)
        let source = try await reader.allNotes()[0]
        let knowledgeRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let store = MondayKnowledgeStore(containerIdentifier: "invalid.test.container", localRootURL: knowledgeRoot)

        let first = try await store.promoteObsidian(source)
        let repeated = try await store.promoteObsidian(source)

        #expect(first.id == repeated.id)
        #expect(repeated.revision == first.revision)
        #expect(first.source == .obsidian)
        #expect(first.provenance?.sourcePath == "Knowledge/Chris Binion.md")
        #expect(first.provenance?.sourceLink == "[[Knowledge/Chris Binion]]")
        #expect(first.provenance?.reviewStatus == .accepted)
        #expect(first.provenance?.sourceRevisionHash == MondayKnowledgeStore.sha256(source.markdown))

        let grounded = KnowledgeQuery.rankedObsidianContext([first], query: "Who am I?")
        #expect(grounded.first?.id == first.id)

        let revoked = try await store.revokeObsidian(relativePath: source.relativePath)
        #expect(revoked?.isDeleted == true)
        #expect(revoked?.provenance?.reviewStatus == .revoked)
        #expect(KnowledgeQuery.search((try await store.load()).notes, query: "Chris").isEmpty)
    }

    @Test("Operational requests bypass personal vault context and reach their domain")
    func operationalRouting() {
        #expect(MondayRequestRouting.isCalendarRequest("How's my day looking?"))
        #expect(MondayRequestRouting.isCalendarRequest("Plan my day"))
        #expect(!MondayRequestRouting.shouldUsePersonalVaultContext("Can you read my email?"))
        #expect(!MondayRequestRouting.shouldUsePersonalVaultContext("How's my day looking?"))
        #expect(MondayRequestRouting.shouldUsePersonalVaultContext("What do you know about me?"))
        #expect(MondayRequestRouting.isEmailRequest("Can you read my email?"))
        #expect(MondayRequestRouting.requestedApplicationName("Can you launch Forge?") == "FORGE")
        #expect(MondayRequestRouting.requestedApplicationName("Open CurseForge") == nil)
    }

    private func temporaryVault() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func write(_ value: String, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try value.write(to: url, atomically: true, encoding: .utf8)
    }
}
