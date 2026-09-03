import CoreGraphics
import Foundation

protocol ScreenLocking: Sendable {
    func lockScreen() throws
}

enum ActionExecutionError: Error, Equatable, Sendable {
    case unsupported
    case permissionRequired
    case failed(String)
}

struct LockAction: ScreenLocking {
    private static let qKeyCode: CGKeyCode = 12

    func lockScreen() throws {
        guard AccessibilityPermission.isTrusted else {
            throw ActionExecutionError.permissionRequired
        }

        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw ActionExecutionError.failed("Unable to create event source")
        }

        let flags: CGEventFlags = [.maskCommand, .maskControl]
        guard
            let keyDown = CGEvent(keyboardEventSource: source, virtualKey: Self.qKeyCode, keyDown: true),
            let keyUp = CGEvent(keyboardEventSource: source, virtualKey: Self.qKeyCode, keyDown: false)
        else {
            throw ActionExecutionError.failed("Unable to create lock key events")
        }

        keyDown.flags = flags
        keyUp.flags = flags
        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)
        MoteLog.actions.info("Lock action posted")
    }
}
