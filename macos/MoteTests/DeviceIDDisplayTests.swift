import XCTest
@testable import Mote

final class DeviceIDDisplayTests: XCTestCase {
    func testAbbreviatesUUID() {
        XCTAssertEqual(
            DeviceIDDisplay.abbreviated("7B0F0000-0000-0000-0000-0000000091AC"),
            "7B0F…91AC"
        )
    }

    func testKeepsShortValues() {
        XCTAssertEqual(DeviceIDDisplay.abbreviated("7B0F"), "7B0F")
    }
}
