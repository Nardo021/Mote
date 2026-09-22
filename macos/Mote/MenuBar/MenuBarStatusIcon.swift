import AppKit
import os
import SwiftUI

enum MenuBarIconImage {
    static let pointSize = NSSize(width: 18, height: 18)
    private static let backingScale: CGFloat = 2
    private static let cache = OSAllocatedUnfairLock(initialState: [CacheKey: NSImage]())

    private struct CacheKey: Hashable, Sendable {
        let tone: MoteStatusTone
        let appearanceName: String
        let width: Int
        let height: Int
    }

    static func make(tone: MoteStatusTone, colorScheme: ColorScheme) -> NSImage {
        make(tone: tone, appearance: appearance(for: colorScheme))
    }

    static func make(
        tone: MoteStatusTone,
        appearance: NSAppearance,
        pointSize: NSSize = pointSize
    ) -> NSImage {
        let key = CacheKey(
            tone: tone,
            appearanceName: appearance.name.rawValue,
            width: Int(pointSize.width * backingScale),
            height: Int(pointSize.height * backingScale)
        )
        if let cached = cache.withLock({ $0[key] }) {
            return cached
        }
        let image = render(tone: tone, appearance: appearance, pointSize: pointSize)
        return cache.withLock { storage in
            if let cached = storage[key] {
                return cached
            }
            storage[key] = image
            return image
        }
    }

    private static func render(
        tone: MoteStatusTone,
        appearance: NSAppearance,
        pointSize: NSSize
    ) -> NSImage {
        let pixelWidth = Int(pointSize.width * backingScale)
        let pixelHeight = Int(pointSize.height * backingScale)
        let image = NSImage(size: pointSize)
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelWidth,
            pixelsHigh: pixelHeight,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else {
            return image
        }

        bitmap.size = pointSize
        image.addRepresentation(bitmap)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        appearance.performAsCurrentDrawingAppearance {
            draw(in: CGRect(origin: .zero, size: pointSize), tone: tone, appearance: appearance)
        }
        NSGraphicsContext.restoreGraphicsState()
        image.isTemplate = false
        return image
    }

    private static func appearance(for colorScheme: ColorScheme) -> NSAppearance {
        let name: NSAppearance.Name = colorScheme == .dark ? .darkAqua : .aqua
        return NSAppearance(named: name) ?? NSAppearance(named: .aqua)!
    }

    private static func draw(in rect: CGRect, tone: MoteStatusTone, appearance: NSAppearance) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let logoStroke = isDark
            ? NSColor.white
            : NSColor(srgbRed: 0x17 / 255, green: 0x19 / 255, blue: 0x1C / 255, alpha: 1)

        drawLogo(in: rect, context: context, stroke: logoStroke)

        let unit = rect.width / 18
        let diameter = 6.5 * unit
        let inset = 0.35 * unit
        let badgeRect = CGRect(
            x: rect.maxX - diameter - inset,
            y: rect.minY + inset,
            width: diameter,
            height: diameter
        )
        context.setFillColor(nsColor(tone.color).cgColor)
        context.fillEllipse(in: badgeRect)
        let ring = isDark
            ? NSColor.white.withAlphaComponent(0.9)
            : NSColor.white
        context.setStrokeColor(ring.cgColor)
        context.setLineWidth(0.9 * unit)
        context.strokeEllipse(in: badgeRect.insetBy(dx: 0.15 * unit, dy: 0.15 * unit))
    }

    private static func drawLogo(in rect: CGRect, context: CGContext, stroke: NSColor) {
        let padding = 0.5 * (rect.width / 18)
        let logoRect = rect.insetBy(dx: padding, dy: padding)
        let scale = min(logoRect.width, logoRect.height) / 32

        context.saveGState()
        context.translateBy(x: logoRect.minX, y: logoRect.maxY)
        context.scaleBy(x: scale, y: -scale)
        context.setStrokeColor(stroke.cgColor)
        context.setLineCap(.round)
        context.setLineJoin(.round)

        context.setLineWidth(2.4)
        context.move(to: CGPoint(x: 6, y: 26))
        context.addCurve(
            to: CGPoint(x: 16, y: 10),
            control1: CGPoint(x: 6, y: 20),
            control2: CGPoint(x: 9, y: 14)
        )
        context.strokePath()

        context.move(to: CGPoint(x: 26, y: 26))
        context.addCurve(
            to: CGPoint(x: 16, y: 10),
            control1: CGPoint(x: 26, y: 20),
            control2: CGPoint(x: 23, y: 14)
        )
        context.strokePath()

        context.setLineWidth(2.4)
        context.strokeEllipse(in: CGRect(x: 3.8, y: 23.8, width: 4.4, height: 4.4))
        context.strokeEllipse(in: CGRect(x: 23.8, y: 23.8, width: 4.4, height: 4.4))

        context.setStrokeColor(nsColor(MoteColors.accent).cgColor)
        context.setLineWidth(2.4)
        context.strokeEllipse(in: CGRect(x: 13, y: 7, width: 6, height: 6))
        context.restoreGState()
    }

    static func nsColor(_ color: Color) -> NSColor {
        NSColor(color)
    }
}

enum MenuBarStatusDot {
    private static let pointSize = NSSize(width: 12, height: 12)
    private static let backingScale: CGFloat = 2

    static func make(tone: MoteStatusTone, filled: Bool) -> NSImage {
        let pixel = Int(pointSize.width * backingScale)
        let image = NSImage(size: pointSize)
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixel,
            pixelsHigh: pixel,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else {
            return image
        }

        bitmap.size = pointSize
        image.addRepresentation(bitmap)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        if let context = NSGraphicsContext.current?.cgContext {
            let color = MenuBarIconImage.nsColor(tone.color)
            let rect = CGRect(origin: .zero, size: pointSize).insetBy(dx: 2.2, dy: 2.2)
            if filled {
                context.setFillColor(color.cgColor)
                context.fillEllipse(in: rect)
            } else {
                context.setStrokeColor(color.cgColor)
                context.setLineWidth(1.5)
                context.strokeEllipse(in: rect.insetBy(dx: 0.75, dy: 0.75))
            }
        }
        NSGraphicsContext.restoreGraphicsState()
        image.isTemplate = false
        return image
    }
}
