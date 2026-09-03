import ApplicationServices
import AppKit
import Foundation

enum AccessibilityPermission {
    static var isTrusted: Bool {
        check(prompt: false)
    }

    @discardableResult
    static func check(prompt: Bool) -> Bool {
        let options = ["AXTrustedCheckOptionPrompt": prompt] as CFDictionary
        let declared = AXIsProcessTrustedWithOptions(options)
        return AccessibilityTrust.resolve(declared: declared, probe: AccessibilityTrust.liveProbe())
    }

    static func openSystemSettings() {
        let candidates = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        ]
        for candidate in candidates {
            guard let url = URL(string: candidate) else {
                continue
            }
            if NSWorkspace.shared.open(url) {
                return
            }
        }
    }
}
