import SwiftUI

@main
struct MoteApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        MenuBarExtra {
            MenuBarView()
                .environment(appDelegate.appState)
        } label: {
            Label("Mote", systemImage: "dot.radiowaves.left.and.right")
        }
        .menuBarExtraStyle(.menu)

        Window("Mote", id: "main") {
            MainWindowView()
                .environment(appDelegate.appState)
        }
        .defaultSize(width: MoteSpacing.windowIdealWidth, height: MoteSpacing.windowIdealHeight)
        .windowResizability(.automatic)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
