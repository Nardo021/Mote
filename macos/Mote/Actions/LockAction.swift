import CoreGraphics
import Darwin
import Foundation

protocol ScreenLocking: Sendable {
    func lockScreen() throws
}

enum ActionExecutionError: Error, Equatable, Sendable {
    case unsupported
    case permissionRequired
    case failed(String)
}

enum LoginSession {
    private static let lockFn: (@convention(c) () -> Void)? = resolve()

    static var isAvailable: Bool {
        lockFn != nil
    }

    static func lockImmediate() -> Bool {
        guard let lockFn else {
            return false
        }
        lockFn()
        return true
    }

    private static func resolve() -> (@convention(c) () -> Void)? {
        let paths = [
            "/System/Library/PrivateFrameworks/login.framework/login",
            "/System/Library/PrivateFrameworks/login.framework/Versions/A/login",
            "/System/Library/PrivateFrameworks/login.framework/Versions/Current/login",
        ]
        for path in paths {
            guard let handle = dlopen(path, RTLD_NOW) else {
                continue
            }
            guard let symbol = dlsym(handle, "SACLockScreenImmediate") else {
                dlclose(handle)
                continue
            }
            return unsafeBitCast(symbol, to: (@convention(c) () -> Void).self)
        }
        return nil
    }
}

struct LockAction: ScreenLocking {
    private let sessionLock: @Sendable () -> Bool
    private let isTrusted: @Sendable () -> Bool
    private let fallbackLock: @Sendable () throws -> Void

    init(
        sessionLock: @escaping @Sendable () -> Bool = LoginSession.lockImmediate,
        isTrusted: @escaping @Sendable () -> Bool = { AccessibilityPermission.isTrusted },
        fallbackLock: @escaping @Sendable () throws -> Void = LockAction.postLockKeyEvents
    ) {
        self.sessionLock = sessionLock
        self.isTrusted = isTrusted
        self.fallbackLock = fallbackLock
    }

    func lockScreen() throws {
        if sessionLock() {
            MoteLog.actions.info("Lock action used login session")
            return
        }

        guard isTrusted() else {
            throw ActionExecutionError.permissionRequired
        }

        try fallbackLock()
        MoteLog.actions.info("Lock action posted")
    }

    static func postLockKeyEvents() throws {
        let qKeyCode: CGKeyCode = 12
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw ActionExecutionError.failed("Unable to create event source")
        }

        let flags: CGEventFlags = [.maskCommand, .maskControl]
        guard
            let keyDown = CGEvent(keyboardEventSource: source, virtualKey: qKeyCode, keyDown: true),
            let keyUp = CGEvent(keyboardEventSource: source, virtualKey: qKeyCode, keyDown: false)
        else {
            throw ActionExecutionError.failed("Unable to create lock key events")
        }

        keyDown.flags = flags
        keyUp.flags = flags
        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)
    }
}
