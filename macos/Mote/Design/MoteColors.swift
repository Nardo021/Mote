import AppKit
import SwiftUI

enum MoteColors {
    static let canvas = Color(moteToken: "mote.canvas", light: "F7F8FA", dark: "101114")
    static let surface = Color(moteToken: "mote.surface", light: "FFFFFF", dark: "17191D")
    static let surfaceSecondary = Color(moteToken: "mote.surface.secondary", light: "F1F3F6", dark: "1E2126")
    static let surfaceElevated = Color(moteToken: "mote.surface.elevated", light: "FFFFFF", dark: "25282E")

    static let border = Color(moteToken: "mote.border", light: "E1E4E8", dark: "2C3037")
    static let borderStrong = Color(moteToken: "mote.border.strong", light: "CDD2D9", dark: "3A3F48")

    static let accent = Color(moteToken: "mote.accent", light: "4F7CFF", dark: "6B91FF")
    static let accentSoft = Color(moteToken: "mote.accent.soft", light: "E9EFFF", dark: "1E2B52")

    /// sRGB fill for AppKit-backed controls. Dynamic `NSColor(name:)` tokens do not tint `borderedProminent`.
    static func accentFill(for scheme: ColorScheme) -> Color {
        scheme == .dark
            ? Color(red: 107 / 255, green: 145 / 255, blue: 255 / 255)
            : Color(red: 79 / 255, green: 124 / 255, blue: 255 / 255)
    }

    static let success = Color(moteToken: "mote.success", light: "2F9E63", dark: "49C47D")
    static let warning = Color(moteToken: "mote.warning", light: "C88719", dark: "E7A83A")
    static let error = Color(moteToken: "mote.error", light: "D54848", dark: "F06A6A")
    static let offline = Color(moteToken: "mote.offline", light: "8A9099", dark: "777E88")

    /// 1px structural ring. Pure black/white so it does not pick up the canvas tint.
    static func hairline(for scheme: ColorScheme) -> Color {
        scheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)
    }
}

private extension Color {
    init(moteToken name: String, light: String, dark: String) {
        self.init(
            nsColor: NSColor(name: name) { appearance in
                let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                return NSColor(moteHex: isDark ? dark : light)
            }
        )
    }
}

private extension NSColor {
    convenience init(moteHex: String) {
        var value: UInt64 = 0
        Scanner(string: moteHex).scanHexInt64(&value)
        self.init(
            srgbRed: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}
