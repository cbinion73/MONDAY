import AppKit
import Security

struct Credential {
    let title: String
    let service: String
    let account: String
    let prefix: String
    let placeholder: String
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let credentials = [
        Credential(title: "OpenAI Health Tunnel ID", service: "MONDAY_OPENAI_HEALTH_TUNNEL_ID", account: "monday-health", prefix: "tunnel_", placeholder: "tunnel_..."),
        Credential(title: "OpenAI Health Runtime Key", service: "MONDAY_OPENAI_TUNNEL_RUNTIME_KEY", account: "monday-health", prefix: "sk-", placeholder: "sk-..."),
        Credential(title: "Anthropic API Key", service: "MONDAY_ANTHROPIC_API_KEY", account: "monday", prefix: "sk-ant-", placeholder: "sk-ant-...")
    ]
    private let selector = NSPopUpButton()
    private let valueField = NSSecureTextField()
    private let status = NSTextField(labelWithString: "Stored only in your macOS login Keychain.")
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 560, height: 270), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "MONDAY Credentials"
        window.center()
        window.isReleasedWhenClosed = false

        let content = NSView(frame: window.contentView?.bounds ?? .zero)
        let heading = NSTextField(labelWithString: "MONDAY secure credentials")
        heading.font = .systemFont(ofSize: 18, weight: .semibold)
        heading.frame = NSRect(x: 28, y: 214, width: 500, height: 28)
        content.addSubview(heading)

        let description = NSTextField(wrappingLabelWithString: "Credentials are held in your macOS login Keychain. They are not written to MONDAY, notes, logs, or this chat.")
        description.textColor = .secondaryLabelColor
        description.frame = NSRect(x: 28, y: 165, width: 504, height: 38)
        content.addSubview(description)

        selector.addItems(withTitles: credentials.map(\.title))
        selector.frame = NSRect(x: 28, y: 122, width: 504, height: 28)
        selector.target = self
        selector.action = #selector(selectionChanged)
        content.addSubview(selector)

        valueField.placeholderString = credentials[0].placeholder
        valueField.frame = NSRect(x: 28, y: 82, width: 504, height: 28)
        content.addSubview(valueField)

        let save = NSButton(title: "Save to Keychain", target: self, action: #selector(saveCredential))
        save.bezelStyle = .rounded
        save.keyEquivalent = "\r"
        save.frame = NSRect(x: 390, y: 34, width: 142, height: 32)
        content.addSubview(save)

        status.textColor = .secondaryLabelColor
        status.frame = NSRect(x: 28, y: 36, width: 350, height: 28)
        content.addSubview(status)

        window.contentView = content
        self.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        window.makeFirstResponder(valueField)
    }

    @objc private func selectionChanged() {
        valueField.stringValue = ""
        valueField.placeholderString = selected.placeholder
        status.stringValue = "Stored only in your macOS login Keychain."
        status.textColor = .secondaryLabelColor
    }

    private var selected: Credential { credentials[selector.indexOfSelectedItem] }

    @objc private func saveCredential() {
        let credential = selected
        let value = valueField.stringValue
        guard value.hasPrefix(credential.prefix), value.count > credential.prefix.count else {
            status.stringValue = "Enter a value beginning with \(credential.prefix)."
            status.textColor = .systemRed
            return
        }
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: credential.service, kSecAttrAccount: credential.account]
        let attributes: [CFString: Any] = [kSecValueData: Data(value.utf8), kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock]
        let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        let result: OSStatus
        if update == errSecItemNotFound {
            var add = query
            attributes.forEach { add[$0.key] = $0.value }
            result = SecItemAdd(add as CFDictionary, nil)
        } else { result = update }
        valueField.stringValue = ""
        if result == errSecSuccess {
            status.stringValue = "Saved securely in Keychain."
            status.textColor = .systemGreen
        } else {
            status.stringValue = "Keychain save failed (status \(result))."
            status.textColor = .systemRed
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
