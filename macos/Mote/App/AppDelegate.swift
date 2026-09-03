import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appState = AppState()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowWillClose(_:)),
            name: NSWindow.willCloseNotification,
            object: nil
        )
        appState.start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        appState.prepareToShowWindow()
        appState.shouldOpenSettings = true
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        appState.refreshPermissionsAndLoginItem()
    }

    func applicationWillTerminate(_ notification: Notification) {
        MoteLog.app.info("Mote terminating")
    }

    @objc
    private func windowWillClose(_ notification: Notification) {
        DispatchQueue.main.async { [weak self] in
            let visible = NSApp.windows.contains { window in
                window.isVisible && window.canBecomeMain && !window.className.contains("StatusBar")
            }
            if !visible {
                NSApp.setActivationPolicy(.accessory)
                self?.appState.refreshPermissionsAndLoginItem()
            }
        }
    }
}
