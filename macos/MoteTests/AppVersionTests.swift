import XCTest
@testable import Mote

final class AppVersionTests: XCTestCase {
    func testFormatsMarketingAndBuild() {
        XCTAssertEqual(
            AppVersion.display(from: [
                "CFBundleShortVersionString": "1.0.0",
                "CFBundleVersion": "1",
            ]),
            "1.0.0 (1)"
        )
    }

    func testFallsBackWhenOnePartIsMissing() {
        XCTAssertEqual(
            AppVersion.display(from: ["CFBundleShortVersionString": "1.0.0"]),
            "1.0.0"
        )
        XCTAssertEqual(
            AppVersion.display(from: ["CFBundleVersion": "12"]),
            "12"
        )
        XCTAssertEqual(AppVersion.display(from: [:]), "unknown")
    }
}
