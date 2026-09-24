import AppKit
import SwiftUI

/// Matches the content canvas to the title bar so the window reads as one surface.
struct WindowChrome: NSViewRepresentable {
    func makeNSView(context: Context) -> WindowChromeView {
        WindowChromeView()
    }

    func updateNSView(_ nsView: WindowChromeView, context: Context) {}
}

final class WindowChromeView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        apply()
    }

    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        apply()
    }

    private func apply() {
        guard let window else { return }
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .visible
        window.backgroundColor = .windowBackgroundColor
        window.isMovableByWindowBackground = true
    }
}
