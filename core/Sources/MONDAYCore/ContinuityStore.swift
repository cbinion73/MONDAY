import Foundation

public protocol ContinuityStore: Sendable {
    func load() async throws -> MondayWorkspace?
    func save(_ workspace: MondayWorkspace) async throws
}

public actor InMemoryContinuityStore: ContinuityStore {
    private var workspace: MondayWorkspace?

    public init(workspace: MondayWorkspace? = nil) {
        self.workspace = workspace
    }

    public func load() -> MondayWorkspace? { workspace }

    public func save(_ workspace: MondayWorkspace) {
        self.workspace = workspace
    }
}

public actor FileContinuityStore: ContinuityStore {
    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(fileURL: URL) {
        self.fileURL = fileURL
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func load() throws -> MondayWorkspace? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return try decoder.decode(MondayWorkspace.self, from: Data(contentsOf: fileURL))
    }

    public func save(_ workspace: MondayWorkspace) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try encoder.encode(workspace)
        try data.write(to: fileURL, options: .atomic)
    }
}
