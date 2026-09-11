import AppKit
import Foundation
import MONDAYCore
import SQLite3

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// A deliberately narrow bridge between one trusted Messages contact and the
/// MONDAY workspace. It reads only newly-arrived direct messages from the
/// configured handle; it never imports, indexes, or summarizes the inbox.
@MainActor
final class MondayMessagesBridge {
    private enum Keys {
        static let contactHandle = "MONDAY_MESSAGES_CONTACT_HANDLE"
        static let lastRowID = "MONDAY_MESSAGES_LAST_ROW_ID"
    }

    private weak var model: MondayAppModel?
    private var pollTask: Task<Void, Never>?
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    deinit { pollTask?.cancel() }

    var contactHandle: String {
        defaults.string(forKey: Keys.contactHandle) ?? ""
    }

    func connect(to model: MondayAppModel) {
        self.model = model
    }

    func configure(contactHandle: String) {
        let normalized = contactHandle.trimmingCharacters(in: .whitespacesAndNewlines)
        defaults.set(normalized, forKey: Keys.contactHandle)
        defaults.removeObject(forKey: Keys.lastRowID)
    }

    func reconcile(settings: TrustSettings) async -> String {
        guard settings.messagesRead else {
            pollTask?.cancel()
            pollTask = nil
            return "Messages is off in Trust Center. No messages are being observed."
        }
        guard !contactHandle.isEmpty else {
            pollTask?.cancel()
            pollTask = nil
            return "Add the iMessage address or phone number for the one person allowed to talk with MONDAY."
        }
        do {
            try establishCursorIfNeeded()
        } catch {
            pollTask?.cancel()
            pollTask = nil
            return "Messages needs Full Disk Access before it can observe the configured conversation. (error.localizedDescription)"
        }
        guard pollTask == nil else { return "Messages bridge is watching new messages from (contactHandle)." }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.poll()
                try? await Task.sleep(for: .seconds(2))
            }
        }
        return "Messages bridge is watching new messages from (contactHandle)."
    }

    func sendAttention(_ text: String) throws {
        guard !contactHandle.isEmpty else {
            throw SpecialistError.permissionRequired("Add MONDAY’s trusted Messages contact before sending an attention update.")
        }
        try send(text, to: contactHandle)
    }

    private func poll() async {
        guard let model,
              model.workspace.settings.messagesRead,
              !contactHandle.isEmpty else { return }
        do {
            for message in try unreadMessages(after: defaults.object(forKey: Keys.lastRowID) as? Int64 ?? 0, from: contactHandle) {
                defaults.set(message.rowID, forKey: Keys.lastRowID)
                let reply = await handle(message, with: model)
                if model.workspace.settings.messagesAutoReply, let reply {
                    try send(reply, to: contactHandle)
                }
            }
        } catch {
            model.messagesBridgeStatus = "Messages paused: (error.localizedDescription)"
            pollTask?.cancel()
            pollTask = nil
        }
    }

    private func handle(_ inbound: IncomingMessage, with model: MondayAppModel) async -> String? {
        if let token = approvalToken(in: inbound.text) {
            return await model.approveFromMessages(token: token)
        }
        if let token = declineToken(in: inbound.text) {
            return await model.declineFromMessages(token: token)
        }
        let attachmentContext = inbound.attachments.isEmpty
            ? ""
            : "\n\n[Messages attachment received locally: \(inbound.attachments.joined(separator: ", "))]"
        return await model.receiveFromMessages(inbound.text + attachmentContext)
    }

    private func approvalToken(in text: String) -> String? {
        let words = text.uppercased().split(whereSeparator: { $0.isWhitespace })
        guard words.count == 2, words[0] == "APPROVE" else { return nil }
        return String(words[1])
    }

    private func declineToken(in text: String) -> String? {
        let words = text.uppercased().split(whereSeparator: { $0.isWhitespace })
        guard words.count == 2, words[0] == "DECLINE" else { return nil }
        return String(words[1])
    }

    private func establishCursorIfNeeded() throws {
        guard defaults.object(forKey: Keys.lastRowID) == nil else { return }
        defaults.set(try MessagesDatabase.latestRowID(), forKey: Keys.lastRowID)
    }

    private func unreadMessages(after rowID: Int64, from handle: String) throws -> [IncomingMessage] {
        try MessagesDatabase.incomingMessages(after: rowID, contactHandle: handle)
    }

    private func send(_ text: String, to handle: String) throws {
        let source = """
        tell application "Messages"
            set targetService to 1st service whose service type = iMessage
            set targetBuddy to buddy \(appleScriptLiteral(handle)) of targetService
            send \(appleScriptLiteral(text)) to targetBuddy
        end tell
        """
        var error: NSDictionary?
        NSAppleScript(source: source)?.executeAndReturnError(&error)
        if let error {
            throw SpecialistError.unavailable("Messages could not send the reply. \(error[NSAppleScript.errorMessage] as? String ?? "macOS did not explain why.")")
        }
    }

    private func appleScriptLiteral(_ value: String) -> String {
        "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n") + "\""
    }
}

private struct IncomingMessage: Sendable {
    let rowID: Int64
    let text: String
    let attachments: [String]
}

private enum MessagesDatabase {
    private static let databaseURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Messages/chat.db")

    static func latestRowID() throws -> Int64 {
        try withDatabase { database in
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            guard sqlite3_prepare_v2(database, "SELECT COALESCE(MAX(ROWID), 0) FROM message", -1, &statement, nil) == SQLITE_OK,
                  sqlite3_step(statement) == SQLITE_ROW else {
                throw databaseError(database)
            }
            return sqlite3_column_int64(statement, 0)
        }
    }

    static func incomingMessages(after rowID: Int64, contactHandle: String) throws -> [IncomingMessage] {
        try withDatabase { database in
            let query = """
            SELECT m.ROWID, COALESCE(m.text, ''), COALESCE(GROUP_CONCAT(a.filename, char(31)), '')
            FROM message m
            JOIN handle h ON h.ROWID = m.handle_id
            LEFT JOIN message_attachment_join maj ON maj.message_id = m.ROWID
            LEFT JOIN attachment a ON a.ROWID = maj.attachment_id
            WHERE m.ROWID > ?
              AND m.is_from_me = 0
              AND m.is_system_message = 0
              AND m.item_type = 0
              AND (h.id = ? OR h.uncanonicalized_id = ?)
            GROUP BY m.ROWID
            ORDER BY m.ROWID ASC
            """
            var statement: OpaquePointer?
            defer { sqlite3_finalize(statement) }
            guard sqlite3_prepare_v2(database, query, -1, &statement, nil) == SQLITE_OK else { throw databaseError(database) }
            sqlite3_bind_int64(statement, 1, rowID)
            sqlite3_bind_text(statement, 2, contactHandle, -1, sqliteTransient)
            sqlite3_bind_text(statement, 3, contactHandle, -1, sqliteTransient)

            var result: [IncomingMessage] = []
            while sqlite3_step(statement) == SQLITE_ROW {
                let text = String(cString: sqlite3_column_text(statement, 1))
                let attachmentText = String(cString: sqlite3_column_text(statement, 2))
                result.append(IncomingMessage(
                    rowID: sqlite3_column_int64(statement, 0),
                    text: text.isEmpty ? "[Attachment]" : text,
                    attachments: attachmentText.split(separator: "\u{1F}").map(String.init)
                ))
            }
            guard sqlite3_errcode(database) == SQLITE_OK || sqlite3_errcode(database) == SQLITE_DONE else { throw databaseError(database) }
            return result
        }
    }

    private static func withDatabase<T>(_ body: (OpaquePointer?) throws -> T) throws -> T {
        var database: OpaquePointer?
        let result = sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil)
        defer { sqlite3_close(database) }
        guard result == SQLITE_OK else { throw databaseError(database) }
        return try body(database)
    }

    private static func databaseError(_ database: OpaquePointer?) -> SpecialistError {
        SpecialistError.permissionRequired("Messages database is unavailable. Grant MONDAY Full Disk Access in System Settings, then reopen MONDAY. \(database.map { String(cString: sqlite3_errmsg($0)) } ?? "")")
    }
}
