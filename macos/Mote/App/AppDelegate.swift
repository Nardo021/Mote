import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appState = AppState()
    private var statusItemController: MenuBarStatusItemController?
    private var hostedMainWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowWillClose(_:)),
            name: NSWindow.willCloseNotification,
            object: nil
        )
        statusItemController = MenuBarStatusItemController(appState: appState)
        observeWindowRequests()
        appState.start()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        appState.presentMainWindow()
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        appState.refreshPermissionsAndLoginItem()
    }

    func applicationWillTerminate(_ notification: Notification) {
        MoteLog.app.info("Mote terminating")
    }

    func showMainWindow() {
        appState.prepareToShowWindow()
        if let window = existingMainWindow() {
            window.makeKeyAndOrderFront(nil)
            return
        }
        if hostedMainWindow == nil {
            let hosting = NSHostingController(rootView: MainWindowView().environment(appState))
            let window = NSWindow(contentViewController: hosting)
            window.title = "Mote"
            window.identifier = NSUserInterfaceItemIdentifier("main")
            window.setContentSize(
                NSSize(width: MoteSpacing.windowIdealWidth, height: MoteSpacing.windowIdealHeight)
            )
            window.minSize = NSSize(width: MoteSpacing.windowMinWidth, height: MoteSpacing.windowMinHeight)
            window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            window.isReleasedWhenClosed = false
            window.center()
            hostedMainWindow = window
        }
        hostedMainWindow?.makeKeyAndOrderFront(nil)
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

    private func observeWindowRequests() {
        withObservationTracking {
            _ = appState.shouldOpenSettings
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.handleWindowRequest()
                self?.observeWindowRequests()
            }
        }
        handleWindowRequest()
    }

    private func handleWindowRequest() {
        guard appState.shouldOpenSettings else { return }
        appState.shouldOpenSettings = false
        showMainWindow()
    }

    private func existingMainWindow() -> NSWindow? {
        NSApp.windows.first { window in
            window !== hostedMainWindow
                && window.canBecomeMain
                && !window.className.contains("StatusBar")
                && (window.identifier?.rawValue == "main" || window.title == "Mote")
        }
    }
}
