import Foundation
import CryptoKit

public enum KnowledgeNoteSource: String, Codable, CaseIterable, Sendable {
    case user
    case monday
    case daily
    case imported
    case obsidian
}

public enum KnowledgeReviewStatus: String, Codable, Sendable {
    case accepted
    case revoked
}

public struct KnowledgeProvenance: Codable, Equatable, Sendable {
    public let sourceSystem: String
    public let sourcePath: String
    public let sourceLink: String
    public let sourceRevisionHash: String
    public let sourceModifiedAt: Date?
    public let evidenceTier: String
    public let confidence: Confidence
    public var reviewStatus: KnowledgeReviewStatus
    public let acceptedAt: Date
    public var revokedAt: Date?

    public init(
        sourceSystem: String,
        sourcePath: String,
        sourceLink: String,
        sourceRevisionHash: String,
        sourceModifiedAt: Date?,
        evidenceTier: String,
        confidence: Confidence,
        reviewStatus: KnowledgeReviewStatus = .accepted,
        acceptedAt: Date = .now,
        revokedAt: Date? = nil
    ) {
        self.sourceSystem = sourceSystem
        self.sourcePath = sourcePath
        self.sourceLink = sourceLink
        self.sourceRevisionHash = sourceRevisionHash
        self.sourceModifiedAt = sourceModifiedAt
        self.evidenceTier = evidenceTier
        self.confidence = confidence
        self.reviewStatus = reviewStatus
        self.acceptedAt = acceptedAt
        self.revokedAt = revokedAt
    }
}

public struct KnowledgeNote: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public var title: String
    public var body: String
    public var tags: [String]
    public var aliases: [String]
    public let createdAt: Date
    public var modifiedAt: Date
    public var revision: Int
    public var isPinned: Bool
    public var source: KnowledgeNoteSource
    public var deletedAt: Date?
    public var provenance: KnowledgeProvenance?

    public init(
        id: UUID = UUID(),
        title: String,
        body: String = "",
        tags: [String] = [],
        aliases: [String] = [],
        createdAt: Date = .now,
        modifiedAt: Date = .now,
        revision: Int = 1,
        isPinned: Bool = false,
        source: KnowledgeNoteSource = .user,
        deletedAt: Date? = nil,
        provenance: KnowledgeProvenance? = nil
    ) {
        self.id = id
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.body = body
        self.tags = Self.normalized(tags)
        self.aliases = Self.normalized(aliases)
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
        self.revision = max(1, revision)
        self.isPinned = isPinned
        self.source = source
        self.deletedAt = deletedAt
        self.provenance = provenance
    }

    public var links: [String] { KnowledgeLinks.extract(from: body) }
    public var isDeleted: Bool { deletedAt != nil }

    private static func normalized(_ values: [String]) -> [String] {
        Array(Set(values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }))
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
}

public enum KnowledgeLinks {
    public static func extract(from markdown: String) -> [String] {
        let codePattern = #"```.*?```|`[^`]*`"#
        let searchable: String
        if let codeRegex = try? NSRegularExpression(pattern: codePattern, options: [.dotMatchesLineSeparators]) {
            searchable = codeRegex.stringByReplacingMatches(
                in: markdown,
                range: NSRange(markdown.startIndex..., in: markdown),
                withTemplate: ""
            )
        } else {
            searchable = markdown
        }
        guard let regex = try? NSRegularExpression(pattern: #"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]"#) else { return [] }
        let range = NSRange(searchable.startIndex..., in: searchable)
        let links = regex.matches(in: searchable, range: range).compactMap { match -> String? in
            guard let swiftRange = Range(match.range(at: 1), in: searchable) else { return nil }
            let value = searchable[swiftRange].trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? nil : value
        }
        return Array(Set(links)).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }
}

public struct KnowledgeDocumentCodec: Sendable {
    private struct Metadata: Codable {
        let schema: String
        let id: UUID
        let title: String
        let tags: [String]
        let aliases: [String]
        let createdAt: Date
        let modifiedAt: Date
        let revision: Int
        let isPinned: Bool
        let source: KnowledgeNoteSource
        let deletedAt: Date?
        let provenance: KnowledgeProvenance?
    }

    public init() {}

    public func encode(_ note: KnowledgeNote) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .millisecondsSince1970
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let metadata = Metadata(
            schema: "com.binion.monday.knowledge.note.v1",
            id: note.id,
            title: note.title,
            tags: note.tags,
            aliases: note.aliases,
            createdAt: note.createdAt,
            modifiedAt: note.modifiedAt,
            revision: note.revision,
            isPinned: note.isPinned,
            source: note.source,
            deletedAt: note.deletedAt,
            provenance: note.provenance
        )
        let json = String(decoding: try encoder.encode(metadata), as: UTF8.self)
        return Data("---\nmonday: \(json)\n---\n\(note.body)".utf8)
    }

    public func decode(_ data: Data) throws -> KnowledgeNote {
        let document = String(decoding: data, as: UTF8.self)
        guard document.hasPrefix("---\n"),
              let boundary = document.range(of: "\n---\n", range: document.index(document.startIndex, offsetBy: 4)..<document.endIndex) else {
            throw KnowledgeCodecError.invalidFrontMatter
        }
        let header = document[document.index(document.startIndex, offsetBy: 4)..<boundary.lowerBound]
        guard let metadataLine = header.split(separator: "\n").first(where: { $0.hasPrefix("monday: ") }) else {
            throw KnowledgeCodecError.missingMetadata
        }
        let json = metadataLine.dropFirst("monday: ".count)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        let metadata = try decoder.decode(Metadata.self, from: Data(json.utf8))
        guard metadata.schema == "com.binion.monday.knowledge.note.v1" else { throw KnowledgeCodecError.unsupportedSchema }
        let body = String(document[boundary.upperBound...])
        return KnowledgeNote(
            id: metadata.id,
            title: metadata.title,
            body: body,
            tags: metadata.tags,
            aliases: metadata.aliases,
            createdAt: metadata.createdAt,
            modifiedAt: metadata.modifiedAt,
            revision: metadata.revision,
            isPinned: metadata.isPinned,
            source: metadata.source,
            deletedAt: metadata.deletedAt,
            provenance: metadata.provenance
        )
    }
}

public enum KnowledgeCodecError: Error, LocalizedError {
    case invalidFrontMatter
    case missingMetadata
    case unsupportedSchema

    public var errorDescription: String? {
        switch self {
        case .invalidFrontMatter: "This Markdown file does not contain MONDAY front matter."
        case .missingMetadata: "This Markdown file is missing MONDAY metadata."
        case .unsupportedSchema: "This knowledge note uses an unsupported schema."
        }
    }
}

public enum KnowledgeStorageLocation: String, Codable, Sendable {
    case iCloud
    case local

    public var displayName: String { self == .iCloud ? "iCloud synced" : "Local fallback" }
}

public struct KnowledgeSnapshot: Sendable {
    public let notes: [KnowledgeNote]
    public let location: KnowledgeStorageLocation
    public let rootURL: URL
}

private struct KnowledgeIndex: Codable {
    struct Entry: Codable {
        let id: UUID
        let title: String
        let tags: [String]
        let aliases: [String]
        let links: [String]
        let modifiedAt: Date
        let revision: Int
        let isPinned: Bool
        let source: KnowledgeNoteSource
        let deletedAt: Date?
        let provenance: KnowledgeProvenance?
        let file: String
    }
    let schema: String
    let generatedAt: Date
    let entries: [Entry]
}

public actor MondayKnowledgeStore {
    public static let iCloudContainerIdentifier = "iCloud.com.chris.monday.knowledge"

    private let containerIdentifier: String
    private let localRootURL: URL
    private let codec = KnowledgeDocumentCodec()

    public init(containerIdentifier: String = MondayKnowledgeStore.iCloudContainerIdentifier, localRootURL: URL? = nil) {
        self.containerIdentifier = containerIdentifier
        self.localRootURL = localRootURL ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MONDAY/Knowledge", isDirectory: true)
    }

    public func load() throws -> KnowledgeSnapshot {
        let resolved = resolveRoot()
        try FileManager.default.createDirectory(at: resolved.url, withIntermediateDirectories: true)
        if resolved.location == .iCloud { try migrateLocalNotesIfNeeded(to: resolved.url) }
        let urls = try FileManager.default.contentsOfDirectory(at: resolved.url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
            .filter { $0.pathExtension.lowercased() == "md" }
        var byID: [UUID: KnowledgeNote] = [:]
        for url in urls {
            guard let note = resolvedNote(at: url) else { continue }
            if let current = byID[note.id], current.revision > note.revision || (current.revision == note.revision && current.modifiedAt >= note.modifiedAt) { continue }
            byID[note.id] = note
        }
        let notes = byID.values.sorted(by: Self.noteOrder)
        try writeIndex(notes, root: resolved.url)
        return KnowledgeSnapshot(notes: notes, location: resolved.location, rootURL: resolved.url)
    }

    public func upsert(_ proposed: KnowledgeNote) throws -> KnowledgeNote {
        let resolved = resolveRoot()
        try FileManager.default.createDirectory(at: resolved.url, withIntermediateDirectories: true)
        let fileURL = resolved.url.appendingPathComponent(Self.filename(for: proposed.id))
        let existing = try? codec.decode(Data(contentsOf: fileURL))
        var note = proposed
        note.modifiedAt = .now
        note.revision = existing == nil ? max(1, proposed.revision) : max(proposed.revision, existing?.revision ?? 0) + 1
        try codec.encode(note).write(to: fileURL, options: .atomic)
        _ = try load()
        return note
    }

    public func tombstone(_ proposed: KnowledgeNote) throws -> KnowledgeNote {
        var note = proposed
        note.deletedAt = .now
        return try upsert(note)
    }

    public func promoteObsidian(_ source: ObsidianVaultNote, acceptedAt: Date = .now) throws -> KnowledgeNote {
        let snapshot = try load()
        let existing = snapshot.notes.first { $0.provenance?.sourceSystem == "Obsidian" && $0.provenance?.sourcePath == source.relativePath }
        let hash = Self.sha256(source.markdown)
        if let existing,
           !existing.isDeleted,
           existing.provenance?.sourceRevisionHash == hash,
           existing.provenance?.reviewStatus == .accepted {
            return existing
        }

        let confidence: Confidence = source.tier == .synthesis ? .medium : .high
        let provenance = KnowledgeProvenance(
            sourceSystem: "Obsidian",
            sourcePath: source.relativePath,
            sourceLink: source.wikiLink,
            sourceRevisionHash: hash,
            sourceModifiedAt: source.modifiedAt,
            evidenceTier: source.tier.rawValue,
            confidence: confidence,
            acceptedAt: acceptedAt
        )
        let note = KnowledgeNote(
            id: existing?.id ?? UUID(),
            title: source.title,
            body: source.markdown,
            tags: Array(Set(source.tags + ["obsidian-context", source.tier.rawValue])),
            aliases: [source.wikiLink, source.relativePath],
            createdAt: existing?.createdAt ?? acceptedAt,
            revision: existing?.revision ?? 1,
            isPinned: existing?.isPinned ?? (source.tier == .governing),
            source: .obsidian,
            provenance: provenance
        )
        return try upsert(note)
    }

    public func revokeObsidian(relativePath: String, revokedAt: Date = .now) throws -> KnowledgeNote? {
        let snapshot = try load()
        guard var existing = snapshot.notes.first(where: {
            !$0.isDeleted && $0.provenance?.sourceSystem == "Obsidian" && $0.provenance?.sourcePath == relativePath
        }) else { return nil }
        existing.provenance?.reviewStatus = .revoked
        existing.provenance?.revokedAt = revokedAt
        existing.deletedAt = revokedAt
        return try upsert(existing)
    }

    public func bootstrapIfEmpty() throws -> KnowledgeSnapshot {
        var snapshot = try load()
        guard snapshot.notes.filter({ !$0.isDeleted }).isEmpty else { return snapshot }
        let welcome = KnowledgeNote(
            title: "Welcome to Monday Knowledge",
            body: """
            # A memory you can inspect

            Monday Knowledge stores ordinary Markdown, not a proprietary blob. Connect ideas with `[[double brackets]]`, organize them with tags, and let MONDAY surface the right context when it helps.

            Start with [[Today]] or create a note for a project, person, decision, or idea.
            """,
            tags: ["monday", "start-here"],
            isPinned: true,
            source: .monday
        )
        _ = try upsert(welcome)
        snapshot = try load()
        return snapshot
    }

    private func resolveRoot() -> (url: URL, location: KnowledgeStorageLocation) {
        if let cloud = FileManager.default.url(forUbiquityContainerIdentifier: containerIdentifier) {
            return (cloud.appendingPathComponent("Documents/Monday Knowledge", isDirectory: true), .iCloud)
        }
        return (localRootURL, .local)
    }

    private func writeIndex(_ notes: [KnowledgeNote], root: URL) throws {
        let index = KnowledgeIndex(
            schema: "com.binion.monday.knowledge.index.v1",
            generatedAt: .now,
            entries: notes.map {
                .init(id: $0.id, title: $0.title, tags: $0.tags, aliases: $0.aliases, links: $0.links,
                      modifiedAt: $0.modifiedAt, revision: $0.revision, isPinned: $0.isPinned,
                      source: $0.source, deletedAt: $0.deletedAt, provenance: $0.provenance,
                      file: Self.filename(for: $0.id))
            }
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(index).write(to: root.appendingPathComponent("knowledge-index-v1.json"), options: .atomic)
    }

    private func migrateLocalNotesIfNeeded(to cloudRoot: URL) throws {
        guard localRootURL.standardizedFileURL != cloudRoot.standardizedFileURL,
              FileManager.default.fileExists(atPath: localRootURL.path) else { return }
        let localFiles = try FileManager.default.contentsOfDirectory(
            at: localRootURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ).filter { $0.pathExtension.lowercased() == "md" }
        for sourceURL in localFiles {
            guard let local = try? codec.decode(Data(contentsOf: sourceURL)) else { continue }
            let destination = cloudRoot.appendingPathComponent(Self.filename(for: local.id))
            let cloud = try? codec.decode(Data(contentsOf: destination))
            let winner: KnowledgeNote
            if let cloud, cloud.revision > local.revision || (cloud.revision == local.revision && cloud.modifiedAt >= local.modifiedAt) {
                winner = cloud
            } else {
                winner = local
            }
            try codec.encode(winner).write(to: destination, options: .atomic)
        }
    }

    private func resolvedNote(at url: URL) -> KnowledgeNote? {
        let current = try? codec.decode(Data(contentsOf: url))
        let conflicts = NSFileVersion.unresolvedConflictVersionsOfItem(at: url) ?? []
        let candidates = ([current] + conflicts.map { version in
            try? codec.decode(Data(contentsOf: version.url))
        }).compactMap { $0 }
        guard let winner = candidates.max(by: {
            $0.revision == $1.revision ? $0.modifiedAt < $1.modifiedAt : $0.revision < $1.revision
        }) else { return nil }
        if current != winner { try? codec.encode(winner).write(to: url, options: .atomic) }
        for conflict in conflicts { conflict.isResolved = true }
        if !conflicts.isEmpty { try? NSFileVersion.removeOtherVersionsOfItem(at: url) }
        return winner
    }

    private static func filename(for id: UUID) -> String { "\(id.uuidString.lowercased()).md" }
    public static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    private static func noteOrder(_ lhs: KnowledgeNote, _ rhs: KnowledgeNote) -> Bool {
        if lhs.isPinned != rhs.isPinned { return lhs.isPinned }
        return lhs.modifiedAt > rhs.modifiedAt
    }
}

public enum KnowledgeQuery {
    public static func search(_ notes: [KnowledgeNote], query: String, tag: String? = nil) -> [KnowledgeNote] {
        let active = notes.filter { !$0.isDeleted && (tag == nil || $0.tags.contains(where: { $0.caseInsensitiveCompare(tag!) == .orderedSame })) }
        let terms = query.lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard !terms.isEmpty else { return active.sorted { ($0.isPinned ? 1 : 0, $0.modifiedAt) > ($1.isPinned ? 1 : 0, $1.modifiedAt) } }
        return active.compactMap { note -> (KnowledgeNote, Int)? in
            let title = note.title.lowercased()
            let tags = note.tags.joined(separator: " ").lowercased()
            let aliases = note.aliases.joined(separator: " ").lowercased()
            let body = note.body.lowercased()
            guard terms.allSatisfy({ title.contains($0) || tags.contains($0) || aliases.contains($0) || body.contains($0) }) else { return nil }
            let score = terms.reduce(0) { $0 + (title.contains($1) ? 8 : 0) + (tags.contains($1) ? 4 : 0) + (aliases.contains($1) ? 3 : 0) + (body.contains($1) ? 1 : 0) }
            return (note, score)
        }.sorted { $0.1 == $1.1 ? $0.0.modifiedAt > $1.0.modifiedAt : $0.1 > $1.1 }.map(\.0)
    }

    public static func backlinks(to target: KnowledgeNote, in notes: [KnowledgeNote]) -> [KnowledgeNote] {
        let names = Set(([target.title] + target.aliases).map { $0.lowercased() })
        return notes.filter { note in !note.isDeleted && note.id != target.id && note.links.contains(where: { names.contains($0.lowercased()) }) }
    }

    public static func rankedObsidianContext(_ notes: [KnowledgeNote], query: String, limit: Int = 3) -> [KnowledgeNote] {
        let lower = query.lowercased()
        var terms = Set(lower.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init).filter { $0.count > 2 })
        if lower.contains("who am i") || lower.contains("about me") || lower.contains("understand me") {
            terms.formUnion(["chris", "identity", "preferences"])
        }
        if lower.contains("what matters") || lower.contains("priority") || lower.contains("mission") {
            terms.formUnion(["mission", "focus", "commitment"])
        }
        if lower.contains("tension") || lower.contains("contradiction") || lower.contains("tradeoff") {
            terms.formUnion(["contradiction", "tension"])
        }
        return notes.filter {
            !$0.isDeleted && $0.source == .obsidian && $0.provenance?.reviewStatus == .accepted
        }.compactMap { note -> (KnowledgeNote, Int)? in
            let title = note.title.lowercased()
            let tags = note.tags.joined(separator: " ").lowercased()
            let body = note.body.lowercased()
            let path = note.provenance?.sourcePath.lowercased() ?? ""
            var score = terms.reduce(0) { partial, term in
                partial + (title.contains(term) ? 12 : 0) + (path.contains(term) ? 9 : 0)
                    + (tags.contains(term) ? 6 : 0) + (body.contains(term) ? 2 : 0)
            }
            if lower.contains("who am i"), path == "knowledge/chris binion.md" { score += 80 }
            if lower.contains("what matters"), path == "knowledge/life plan 2025.md" { score += 65 }
            if (lower.contains("tension") || lower.contains("contradiction")), path.hasPrefix("contradictions/") { score += 55 }
            guard score > 0 else { return nil }
            return (note, score)
        }
        .sorted { $0.1 == $1.1 ? $0.0.title < $1.0.title : $0.1 > $1.1 }
        .prefix(max(0, limit))
        .map(\.0)
    }
}
