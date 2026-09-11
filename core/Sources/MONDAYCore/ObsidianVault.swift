import Foundation

public enum ObsidianEvidenceTier: String, Codable, Sendable {
    case governing
    case canonical
    case synthesis
}

public struct ObsidianVaultNote: Identifiable, Codable, Hashable, Sendable {
    public var id: String { relativePath }
    public let relativePath: String
    public let title: String
    public let tags: [String]
    public let type: String?
    public let status: String?
    public let tier: ObsidianEvidenceTier
    public let markdown: String
    public let modifiedAt: Date?

    public var wikiLink: String {
        "[[\(relativePath.dropLast(relativePath.hasSuffix(".md") ? 3 : 0))]]"
    }
}

public struct ObsidianVaultMatch: Codable, Hashable, Sendable {
    public let note: ObsidianVaultNote
    public let score: Int
    public let matchedTerms: [String]
}

public struct ObsidianVaultSnapshot: Codable, Hashable, Sendable {
    public let rootPath: String
    public let indexedNotes: Int
    public let excludedFiles: Int
    public let loadedAt: Date
}

/// A read-only, reproducible view of Chris's curated Obsidian memory.
/// Raw corpora, inbox items, review proposals, databases, and generated
/// deliverables are deliberately excluded from default retrieval.
public actor ObsidianVaultReader {
    private let rootURL: URL
    private let fileManager: FileManager
    private var notes: [ObsidianVaultNote] = []
    private var snapshot: ObsidianVaultSnapshot?

    public init(rootURL: URL, fileManager: FileManager = .default) {
        self.rootURL = rootURL.standardizedFileURL
        self.fileManager = fileManager
    }

    @discardableResult
    public func load() throws -> ObsidianVaultSnapshot {
        var loaded: [ObsidianVaultNote] = []
        var excluded = 0
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        guard let enumerator = fileManager.enumerator(
            at: rootURL,
            includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            throw ObsidianVaultError.unavailable(rootURL.path)
        }

        for case let fileURL as URL in enumerator {
            let values = try? fileURL.resourceValues(forKeys: Set(keys))
            guard values?.isRegularFile == true, fileURL.pathExtension.lowercased() == "md" else { continue }
            let relativePath = relativePath(for: fileURL)
            guard let tier = evidenceTier(for: relativePath), (values?.fileSize ?? 0) <= 300_000 else {
                excluded += 1
                continue
            }
            guard let markdown = try? String(contentsOf: fileURL, encoding: .utf8) else {
                excluded += 1
                continue
            }
            loaded.append(parse(markdown, relativePath: relativePath, tier: tier, modifiedAt: values?.contentModificationDate))
        }

        notes = loaded.sorted { $0.relativePath.localizedStandardCompare($1.relativePath) == .orderedAscending }
        let result = ObsidianVaultSnapshot(
            rootPath: rootURL.path,
            indexedNotes: notes.count,
            excludedFiles: excluded,
            loadedAt: .now
        )
        snapshot = result
        return result
    }

    public func currentSnapshot() -> ObsidianVaultSnapshot? { snapshot }

    public func allNotes() throws -> [ObsidianVaultNote] {
        if snapshot == nil { try load() }
        return notes
    }

    public func search(_ query: String, limit: Int = 3) throws -> [ObsidianVaultMatch] {
        if snapshot == nil { try load() }
        let terms = expandedTerms(for: query)
        return notes.compactMap { note -> ObsidianVaultMatch? in
            let title = normalized(note.title)
            let path = normalized(note.relativePath)
            let tags = normalized(note.tags.joined(separator: " "))
            let headings = normalized(note.markdown.split(separator: "\n").filter { $0.hasPrefix("#") }.joined(separator: " "))
            let body = normalized(note.markdown)
            var score = 0
            var matched: [String] = []
            for term in terms {
                var termScore = 0
                if title.contains(term) { termScore += 14 }
                if path.contains(term) { termScore += 10 }
                if tags.contains(term) { termScore += 8 }
                if headings.contains(term) { termScore += 5 }
                if body.contains(term) { termScore += 2 }
                if termScore > 0 {
                    score += termScore
                    matched.append(term)
                }
            }
            score += contextualBoost(note: note, query: normalized(query))
            if note.tier == .canonical { score += 3 }
            guard score > 0 else { return nil }
            return ObsidianVaultMatch(note: note, score: score, matchedTerms: Array(Set(matched)).sorted())
        }
        .sorted {
            if $0.score != $1.score { return $0.score > $1.score }
            if $0.note.tier != $1.note.tier { return tierRank($0.note.tier) > tierRank($1.note.tier) }
            return $0.note.relativePath < $1.note.relativePath
        }
        .prefix(max(0, limit))
        .map { $0 }
    }

    private func relativePath(for fileURL: URL) -> String {
        String(fileURL.standardizedFileURL.path.dropFirst(rootURL.path.count + 1))
    }

    private func evidenceTier(for path: String) -> ObsidianEvidenceTier? {
        let canonicalRoots = ["Knowledge/", "Missions/", "Family/", "Faith/", "Health/", "Retirement/", "Work/", "Books/", "Contradictions/"]
        if path.hasPrefix("Monday/") { return .governing }
        if canonicalRoots.contains(where: path.hasPrefix) { return .canonical }
        let topLevelMeGPT = [
            "MeGPT/Operating Contract.md", "MeGPT/Comprehensive Portrait.md", "MeGPT/Evidence Map.md",
            "MeGPT/Source Registry.md", "MeGPT/MeGPT Home.md"
        ]
        if topLevelMeGPT.contains(path) { return path.contains("Operating Contract") ? .governing : .synthesis }
        if path.hasPrefix("MeGPT/Synthesis/") || path.hasPrefix("MeGPT/Maps/") || path.hasPrefix("MeGPT/Archive/") {
            return .synthesis
        }
        return nil
    }

    private func parse(
        _ markdown: String,
        relativePath: String,
        tier: ObsidianEvidenceTier,
        modifiedAt: Date?
    ) -> ObsidianVaultNote {
        let lines = markdown.components(separatedBy: .newlines)
        var metadata: [String: String] = [:]
        if lines.first == "---", let end = lines.dropFirst().firstIndex(of: "---") {
            for line in lines[1..<end] {
                let parts = line.split(separator: ":", maxSplits: 1).map(String.init)
                if parts.count == 2 { metadata[parts[0].trimmingCharacters(in: .whitespaces)] = parts[1].trimmingCharacters(in: .whitespaces) }
            }
        }
        let heading = lines.first(where: { $0.hasPrefix("# ") }).map { String($0.dropFirst(2)).trimmingCharacters(in: .whitespaces) }
        let fallbackTitle = URL(fileURLWithPath: relativePath).deletingPathExtension().lastPathComponent
        let rawTags = metadata["tags"]?.trimmingCharacters(in: CharacterSet(charactersIn: "[]")) ?? ""
        let tags = rawTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return ObsidianVaultNote(
            relativePath: relativePath,
            title: heading ?? fallbackTitle,
            tags: tags,
            type: metadata["type"],
            status: metadata["status"],
            tier: tier,
            markdown: markdown,
            modifiedAt: modifiedAt
        )
    }

    private func expandedTerms(for query: String) -> [String] {
        var terms = tokenize(query)
        let lower = normalized(query)
        if lower.contains("who am i") || lower.contains("about me") || lower.contains("understand me") {
            terms.formUnion(["chris", "identity", "portrait", "preferences"])
        }
        if lower.contains("family") || lower.contains("wife") || lower.contains("children") {
            terms.formUnion(["family", "relationships", "rebekah"])
        }
        if lower.contains("priority") || lower.contains("mission") || lower.contains("what matters") {
            terms.formUnion(["mission", "focus", "commitment"])
        }
        if lower.contains("how should you") || lower.contains("how should monday") || lower.contains("personality") {
            terms.formUnion(["constitution", "voice", "preferences"])
        }
        return terms.sorted()
    }

    private func tokenize(_ value: String) -> Set<String> {
        let stopWords: Set<String> = ["about", "after", "again", "could", "from", "have", "into", "just", "that", "the", "this", "what", "when", "where", "which", "with", "would", "your"]
        return Set(normalized(value).split(separator: " ").map(String.init).filter { $0.count > 2 && !stopWords.contains($0) })
    }

    private func normalized(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
    }

    private func contextualBoost(note: ObsidianVaultNote, query: String) -> Int {
        if query.contains("who am i") {
            if note.relativePath == "Knowledge/Chris Binion.md" { return 80 }
            if note.relativePath == "MeGPT/Comprehensive Portrait.md" { return 35 }
        }
        if query.contains("what matters") || query.contains("priority") || query.contains("priorities") {
            if note.relativePath == "Knowledge/Life Plan 2025.md" { return 65 }
            if note.relativePath == "Knowledge/Vault Index.md" { return 45 }
            if note.relativePath.hasPrefix("Missions/") { return 14 }
        }
        if query.contains("tension") || query.contains("contradiction") || query.contains("tradeoff") {
            if note.relativePath.hasPrefix("Contradictions/") { return 55 }
        }
        if query.contains("monday") || query.contains("you") {
            if note.relativePath == "Monday/Constitution.md" { return 20 }
            if note.relativePath == "Monday/Mission.md" { return 12 }
        }
        return 0
    }

    private func tierRank(_ tier: ObsidianEvidenceTier) -> Int {
        switch tier {
        case .governing: 3
        case .canonical: 2
        case .synthesis: 1
        }
    }
}

public enum ObsidianVaultError: LocalizedError, Sendable {
    case unavailable(String)

    public var errorDescription: String? {
        switch self {
        case .unavailable(let path): "The Obsidian vault is unavailable at \(path)."
        }
    }
}
