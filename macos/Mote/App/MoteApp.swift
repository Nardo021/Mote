import SwiftUI

@main
struct MoteApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
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
