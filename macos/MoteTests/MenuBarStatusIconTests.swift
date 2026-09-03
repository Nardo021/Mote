import AppKit
import SwiftUI
import XCTest
@testable import Mote

final class MenuBarStatusIconTests: XCTestCase {
    func testIconIsSizedForMenuBarAndKeepsColor() {
        let appearance = NSAppearance(named: .aqua)!
        let image = MenuBarIconImage.make(tone: .success, appearance: appearance)

        XCTAssertEqual(image.size, MenuBarIconImage.pointSize)
        XCTAssertFalse(image.isTemplate)
    }

    func testStatusDotColorChangesWithTone() {
        let appearance = NSAppearance(named: .aqua)!
        let connected = MenuBarIconImage.make(tone: .success, appearance: appearance)
        let failed = MenuBarIconImage.make(tone: .error, appearance: appearance)
        let idle = MenuBarIconImage.make(tone: .offline, appearance: appearance)

        XCTAssertNotEqual(connected.tiffRepresentation, failed.tiffRepresentation)
        XCTAssertNotEqual(failed.tiffRepresentation, idle.tiffRepresentation)
        XCTAssertNotEqual(connected.tiffRepresentation, idle.tiffRepresentation)
    }

    func testDarkAppearanceStillProducesAColoredIcon() {
        let image = MenuBarIconImage.make(tone: .warning, appearance: NSAppearance(named: .darkAqua)!)
        XCTAssertFalse(image.isTemplate)
        XCTAssertNotNil(image.tiffRepresentation)
    }

    func testStatusDotRendersInBottomRight() throws {
        let image = MenuBarIconImage.make(
            tone: .error,
            appearance: NSAppearance(named: .aqua)!,
            pointSize: NSSize(width: 36, height: 36)
        )
        let bitmap = try XCTUnwrap(NSBitmapImageRep(data: XCTUnwrap(image.tiffRepresentation)))
        let inset = 8
        let bottomRight = try XCTUnwrap(
            bitmap.colorAt(x: bitmap.pixelsWide - inset, y: bitmap.pixelsHigh - inset)
        )
        let topRight = try XCTUnwrap(bitmap.colorAt(x: bitmap.pixelsWide - inset, y: inset))

        XCTAssertGreaterThan(bottomRight.redComponent, 0.45, "Error tone should paint a red dot in the bottom-right")
        XCTAssertLessThan(topRight.redComponent, bottomRight.redComponent)
    }
}
