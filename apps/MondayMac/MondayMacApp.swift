import AppIntents
import SwiftUI

@main
struct MondayMacApp: App {
    @StateObject private var model = MondayAppModel()

    init() {
        MondayShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            MondayRootView()
                .environmentObject(model)
                .frame(minWidth: 1120, minHeight: 720)
                .task { await model.start() }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1380, height: 860)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Focus Composer") { model.composerFocused.toggle() }
                    .keyboardShortcut("k", modifiers: .command)
            }
        }

        Settings {
            MondayTrustView()
                .environmentObject(model)
                .frame(width: 560, height: 520)
        }
    }
}
