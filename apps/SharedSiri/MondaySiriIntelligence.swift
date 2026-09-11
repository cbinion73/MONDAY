import AppIntents
import CoreSpotlight
import Foundation
import MONDAYCore
import UniformTypeIdentifiers

enum MondayContextKind: String, Codable, CaseIterable, AppEnum {
    case commitment
    case decision
    case knowledge
    case approval
    case project

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "MONDAY Context Type"
    static let caseDisplayRepresentations: [MondayContextKind: DisplayRepresentation] = [
        .commitment: "Commitment",
        .decision: "Decision",
        .knowledge: "Knowledge",
        .approval: "Approval Request",
        .project: "Project"
    ]

    var systemImage: String {
        switch self {
        case .commitment: "checkmark.circle"
        case .decision: "arrow.triangle.branch"
        case .knowledge: "note.text"
        case .approval: "hand.raised.fill"
        case .project: "scope"
        }
    }
}

struct MondayContextEntity: AppEntity, IndexedEntity, Identifiable, Hashable {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: "MONDAY Context",
        numericFormat: "\(placeholder: .int) MONDAY items"
    )
    static let defaultQuery = MondayContextQuery()

    let id: String
    let kind: MondayContextKind
    let title: String
    let detail: String
    let status: String
    let modifiedAt: Date
    let keywords: [String]

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(title)",
            subtitle: "\(MondayContextKind.caseDisplayRepresentations[kind]?.title ?? "MONDAY") · \(status)",
            image: .init(systemName: kind.systemImage)
        )
    }

    var attributeSet: CSSearchableItemAttributeSet {
        let attributes = CSSearchableItemAttributeSet(contentType: .text)
        attributes.title = title
        attributes.contentDescription = detail
        attributes.textContent = "\(title)\n\(detail)\n\(status)"
        attributes.keywords = keywords + [kind.rawValue, "MONDAY"]
        attributes.contentModificationDate = modifiedAt
        return attributes
    }
}

struct MondayContextQuery: EntityStringQuery, EnumerableEntityQuery {
    init() {}

    func entities(for identifiers: [String]) async throws -> [MondayContextEntity] {
        let wanted = Set(identifiers)
        return try await MondaySiriRepository.entities().filter { wanted.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [MondayContextEntity] {
        let terms = string.lowercased().split(whereSeparator: { $0.isWhitespace }).map(String.init)
        return try await MondaySiriRepository.entities().filter { entity in
            let haystack = ([entity.title, entity.detail, entity.status] + entity.keywords).joined(separator: " ").lowercased()
            return terms.allSatisfy(haystack.contains)
        }
    }

    func allEntities() async throws -> [MondayContextEntity] {
        try await MondaySiriRepository.entities()
    }

    func suggestedEntities() async throws -> [MondayContextEntity] {
        Array(try await MondaySiriRepository.entities().prefix(12))
    }
}

enum MondaySiriRepository {
    enum BridgeError: Error, LocalizedError {
        case disabled
        var errorDescription: String? { "Siri AI access to MONDAY is disabled in the Trust Center." }
    }

    static var surface: MondaySurface {
#if os(macOS)
        .mac
#else
        .iPhone
#endif
    }

    static var workspaceURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
#if os(macOS)
        return base.appendingPathComponent("MONDAY/workspace-v1.json")
#else
        return base.appendingPathComponent("MONDAY/mobile-workspace-v1.json")
#endif
    }

    static func loadWorkspace() async throws -> MondayWorkspace {
        try await FileContinuityStore(fileURL: workspaceURL).load() ?? MondayWorkspace(lastSurface: surface)
    }

    static func saveWorkspace(_ workspace: MondayWorkspace) async throws {
        try await FileContinuityStore(fileURL: workspaceURL).save(workspace)
    }

    static func entities() async throws -> [MondayContextEntity] {
        let workspace = try await loadWorkspace()
        guard workspace.settings.siriIntelligenceEnabled else { return [] }
        var result: [MondayContextEntity] = workspace.openLoops
            .filter { ![.completed, .abandoned].contains($0.status) }
            .map {
                MondayContextEntity(
                    id: "loop:\($0.id.uuidString)", kind: .commitment, title: $0.title,
                    detail: $0.detail, status: $0.status.rawValue, modifiedAt: $0.updatedAt,
                    keywords: ["open loop", "waiting", "promise", "commitment"]
                )
            }
        result += workspace.actions.filter { $0.status == .proposed }.map {
            MondayContextEntity(
                id: "approval:\($0.id.uuidString)", kind: .approval, title: $0.title,
                detail: $0.explanation, status: "waiting for approval", modifiedAt: $0.proposedAt,
                keywords: ["approval", "decision", "pending", $0.capabilityID]
            )
        }

        let knowledge = workspace.settings.siriKnowledgeIndexingEnabled
            ? try await MondayKnowledgeStore().load().notes.filter { !$0.isDeleted }
            : []
        result += knowledge.map { note in
            let kind: MondayContextKind = note.tags.contains(where: { $0.caseInsensitiveCompare("decision") == .orderedSame })
                ? .decision
                : (note.tags.contains(where: { ["project", "mission"].contains($0.lowercased()) }) ? .project : .knowledge)
            return MondayContextEntity(
                id: "note:\(note.id.uuidString)", kind: kind, title: note.title,
                detail: String(note.body.prefix(1_200)), status: note.isPinned ? "pinned" : "remembered",
                modifiedAt: note.modifiedAt,
                keywords: note.tags + note.aliases + note.links
            )
        }
        return result.sorted { $0.modifiedAt > $1.modifiedAt }
    }

    static func recordCommitment(_ text: String) async throws -> OpenLoop {
        var workspace = try await loadWorkspace()
        guard workspace.settings.siriIntelligenceEnabled else { throw BridgeError.disabled }
        let loop = OpenLoop(
            title: text,
            detail: "Captured through Siri AI for MONDAY follow-through.",
            originatingSurface: surface
        )
        workspace.openLoops.append(loop)
        workspace.audit.append(AuditRecord(
            category: "siri-capture", summary: "Commitment captured", surface: surface,
            outcome: "Recorded as an active open loop; no external action taken"
        ))
        workspace.lastUpdated = .now
        try await saveWorkspace(workspace)
        return loop
    }

    static func captureKnowledge(_ text: String, title: String?) async throws -> KnowledgeNote {
        guard try await loadWorkspace().settings.siriIntelligenceEnabled else { throw BridgeError.disabled }
        let cleanTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTitle = text.split(separator: "\n").first.map { String($0.prefix(72)) } ?? "Siri Capture"
        return try await MondayKnowledgeStore().upsert(KnowledgeNote(
            title: cleanTitle?.isEmpty == false ? cleanTitle! : fallbackTitle,
            body: text,
            tags: ["siri-capture"],
            source: .user
        ))
    }
}

enum MondaySiriVoice {
    static func dailyBrief(_ workspace: MondayWorkspace) -> String {
        let loops = workspace.openLoops.filter { ![.completed, .abandoned].contains($0.status) }
        let approvals = workspace.actions.filter { $0.status == .proposed }
        if let approval = approvals.first {
            return "You have \(loops.count) active commitment\(loops.count == 1 ? "" : "s") and one decision waiting: \(approval.title). I have not acted—because confidence is charming, but consent is mandatory."
        }
        if let first = loops.first {
            return "You have \(loops.count) active commitment\(loops.count == 1 ? "" : "s"). The one I would protect is \(first.title). Everything else may make a persuasive presentation, but it does not get equal billing."
        }
        return "Nothing urgent is waiting. A rare and beautiful condition. We can choose the next important thing instead of letting it choose us."
    }

    static func searchSummary(_ entities: [MondayContextEntity], query: String) -> String {
        guard let first = entities.first else {
            return "I searched MONDAY’s authorized memory for \(query) and found nothing solid. I could improvise, but apparently we value truth around here."
        }
        if entities.count == 1 { return "I found one relevant item: \(first.title). \(first.detail)" }
        let others = entities.dropFirst().prefix(2).map(\.title).joined(separator: ", ")
        return "I found \(entities.count) relevant items. The strongest match is \(first.title). Also connected: \(others)."
    }
}

enum MondaySiriBridge {
    static func refreshIndex() async {
        do {
            let index = CSSearchableIndex.default()
            try await index.deleteAppEntities(ofType: MondayContextEntity.self)
            let entities = try await MondaySiriRepository.entities()
            try await index.indexAppEntities(entities, priority: 10)
        } catch {
            // Indexing is an enhancement. MONDAY's source-of-truth stores remain intact if Spotlight is unavailable.
        }
    }
}

enum MondaySiriDonations {
    static func commitment(_ text: String) async {
        let intent = RecordMondayCommitmentIntent()
        intent.commitment = text
        _ = try? await intent.donate()
    }

    static func knowledge(title: String, content: String) async {
        let intent = CaptureMondayKnowledgeIntent()
        intent.content = content
        intent.noteTitle = title
        _ = try? await intent.donate()
    }
}

struct OpenMondayIntent: AppIntent {
    static let title: LocalizedStringResource = "Open MONDAY"
    static let description = IntentDescription("Open your continuous MONDAY conversation.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        .result(dialog: "MONDAY is ready. Try not to look too relieved.")
    }
}

struct MondayBriefIntent: AppIntent {
    static let title: LocalizedStringResource = "Review My Priorities"
    static let description = IntentDescription("Review commitments, open loops, and decisions with MONDAY.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let workspace = try await MondaySiriRepository.loadWorkspace()
        guard workspace.settings.siriIntelligenceEnabled else {
            return .result(value: "Siri AI access is disabled.", dialog: "Siri AI access to MONDAY is disabled in the Trust Center.")
        }
        let answer = MondaySiriVoice.dailyBrief(workspace)
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct FindMondayContextIntent: AppIntent {
    static let title: LocalizedStringResource = "Find My Decisions and Commitments"
    static let description = IntentDescription("Search MONDAY’s authorized decisions, commitments, projects, and knowledge.")
    static let openAppWhenRun = false

    @Parameter(title: "What to find") var query: String

    static var parameterSummary: some ParameterSummary { Summary("Find \(\.$query) in my MONDAY context") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        guard try await MondaySiriRepository.loadWorkspace().settings.siriIntelligenceEnabled else {
            return .result(value: "Siri AI access is disabled.", dialog: "Siri AI access to MONDAY is disabled in the Trust Center.")
        }
        let matches = try await MondayContextQuery().entities(matching: query)
        let answer = MondaySiriVoice.searchSummary(matches, query: query)
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct CaptureMondayKnowledgeIntent: AppIntent {
    static let title: LocalizedStringResource = "Capture Knowledge"
    static let description = IntentDescription("Save an idea, decision, or observation into Monday Knowledge.")
    static let openAppWhenRun = false

    @Parameter(title: "Content") var content: String
    @Parameter(title: "Title") var noteTitle: String?

    static var parameterSummary: some ParameterSummary { Summary("Remember \(\.$content) in Monday Knowledge") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let note = try await MondaySiriRepository.captureKnowledge(content, title: noteTitle)
        await MondaySiriBridge.refreshIndex()
        let answer = "Captured as \(note.title). Consider it remembered—deliberately, not mysteriously."
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct RecordMondayCommitmentIntent: AppIntent {
    static let title: LocalizedStringResource = "Record a Commitment"
    static let description = IntentDescription("Give MONDAY a commitment to track and follow through.")
    static let openAppWhenRun = false

    @Parameter(title: "Commitment") var commitment: String

    static var parameterSummary: some ParameterSummary { Summary("Remember that I committed to \(\.$commitment)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let loop = try await MondaySiriRepository.recordCommitment(commitment)
        await MondaySiriBridge.refreshIndex()
        let answer = "I’m tracking \(loop.title). It is now an open loop, not a hopeful thought wearing business casual."
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct AssessMondayCapacityIntent: AppIntent {
    static let title: LocalizedStringResource = "Assess My Capacity"
    static let description = IntentDescription("Ask MONDAY whether a proposed initiative fits your real commitments and attention.")
    static let openAppWhenRun = false

    @Parameter(
        title: "Initiative",
        requestValueDialog: IntentDialog(
            full: "What are you thinking about taking on? Give me the initiative, and I’ll check it against your actual capacity.",
            supporting: "What are you considering?"
        )
    )
    var initiative: String
    static var parameterSummary: some ParameterSummary { Summary("Can I realistically take on \(\.$initiative)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let workspace = try await MondaySiriRepository.loadWorkspace()
        guard workspace.settings.siriIntelligenceEnabled else {
            return .result(value: "Siri AI access is disabled.", dialog: "Siri AI access to MONDAY is disabled in the Trust Center.")
        }
        let assessment = MondayCapacityPolicy.assess(
            initiative: initiative,
            workspace: workspace
        )
        let spokenAnswer = "\(assessment.headline). \(assessment.detail)"
        let visualAnswer = "\(assessment.headline)\n\n\(assessment.detail)"
        return .result(
            value: visualAnswer,
            dialog: IntentDialog(
                full: "\(spokenAnswer)",
                supporting: "\(visualAnswer)"
            )
        )
    }
}

struct MondayPendingApprovalsIntent: AppIntent {
    static let title: LocalizedStringResource = "Show Pending Approvals"
    static let description = IntentDescription("Find consequential MONDAY proposals waiting for review without executing them.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let workspace = try await MondaySiriRepository.loadWorkspace()
        guard workspace.settings.siriIntelligenceEnabled else {
            return .result(value: "Siri AI access is disabled.", dialog: "Siri AI access to MONDAY is disabled in the Trust Center.")
        }
        let pending = workspace.actions.filter { $0.status == .proposed }
        let answer = pending.first.map {
            "\(pending.count) approval\(pending.count == 1 ? " is" : "s are") waiting. First: \($0.title). Open MONDAY to review it; Siri does not get to skip the velvet rope."
        } ?? "No approvals are waiting. MONDAY’s hands are clean and conspicuously idle."
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct AskMondayIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask MONDAY"
    static let description = IntentDescription("Route an open-ended request into MONDAY’s governed conversation.")
    static let openAppWhenRun = false

    @Parameter(title: "Request") var request: String
    static var parameterSummary: some ParameterSummary { Summary("Ask MONDAY \(\.$request)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        guard try await MondaySiriRepository.loadWorkspace().settings.siriIntelligenceEnabled else {
            return .result(value: "Siri AI access is disabled.", dialog: "Siri AI access to MONDAY is disabled in the Trust Center.")
        }
        let engine = MondayEngine(
            store: FileContinuityStore(fileURL: MondaySiriRepository.workspaceURL),
            specialists: [
                AppleCalendarSpecialist(),
                AppleRemindersSpecialist(),
                EmailCapabilityBoundarySpecialist(),
                AppleIntelligenceSpecialist()
            ]
        )
        _ = try await engine.start(surface: MondaySiriRepository.surface)
        let workspace = try await engine.send(request, from: MondaySiriRepository.surface)
        let answer = workspace.messages.last(where: { $0.role == .monday })?.text ?? "I recorded that, but I do not yet have a defensible answer."
        return .result(value: answer, dialog: "\(answer)")
    }
}

struct MondayShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenMondayIntent(), phrases: ["Open \(.applicationName)", "Talk to \(.applicationName)"], shortTitle: "Open MONDAY", systemImageName: "waveform.circle.fill")
        AppShortcut(intent: MondayBriefIntent(), phrases: ["Review my priorities with \(.applicationName)", "What's waiting in \(.applicationName)"], shortTitle: "Review priorities", systemImageName: "scope")
        AppShortcut(intent: FindMondayContextIntent(), phrases: ["Find something in \(.applicationName)", "Search my \(.applicationName) context"], shortTitle: "Find context", systemImageName: "sparkle.magnifyingglass")
        AppShortcut(intent: CaptureMondayKnowledgeIntent(), phrases: ["Capture knowledge in \(.applicationName)", "Remember this in \(.applicationName)"], shortTitle: "Capture knowledge", systemImageName: "note.text.badge.plus")
        AppShortcut(intent: RecordMondayCommitmentIntent(), phrases: ["Record a commitment in \(.applicationName)", "Have \(.applicationName) track a promise"], shortTitle: "Record commitment", systemImageName: "checkmark.circle")
        AppShortcut(intent: AssessMondayCapacityIntent(), phrases: ["Assess my capacity with \(.applicationName)", "Can I take this on in \(.applicationName)"], shortTitle: "Assess capacity", systemImageName: "gauge.with.dots.needle.67percent")
        AppShortcut(intent: MondayPendingApprovalsIntent(), phrases: ["Show my \(.applicationName) approvals", "What's waiting for approval in \(.applicationName)"], shortTitle: "Pending approvals", systemImageName: "hand.raised.fill")
        AppShortcut(intent: AskMondayIntent(), phrases: ["Ask \(.applicationName)"], shortTitle: "Ask MONDAY", systemImageName: "sparkles")
    }
}
