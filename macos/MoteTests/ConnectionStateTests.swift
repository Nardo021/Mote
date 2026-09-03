import XCTest
@testable import Mote

final class ConnectionStateTests: XCTestCase {
    func testDisplayTitlesMatchDesign() {
        XCTAssertEqual(ConnectionState.connected.title, "Connected")
        XCTAssertEqual(ConnectionState.connecting.title, "Connecting…")
        XCTAssertEqual(ConnectionState.authenticating.title, "Authenticating…")
        XCTAssertEqual(ConnectionState.reconnecting.title, "Reconnecting…")
        XCTAssertEqual(ConnectionState.disconnected.title, "Disconnected")
        XCTAssertEqual(ConnectionState.error("Relay unavailable").title, "Connection Error")
        XCTAssertEqual(ConnectionState.notConfigured.title, "Not Configured")
    }

    func testMenuTitlesIncludeSymbolAndText() {
        XCTAssertEqual(ConnectionState.connected.menuTitle, "● Connected")
        XCTAssertEqual(ConnectionState.connecting.menuTitle, "◌ Connecting…")
        XCTAssertEqual(ConnectionState.disconnected.menuTitle, "○ Disconnected")
        XCTAssertEqual(ConnectionState.error("invalid_credentials").menuTitle, "● Connection Error")
    }

    func testDebugLabelsAreRawStateNames() {
        XCTAssertEqual(ConnectionState.connected.debugLabel, "connected")
        XCTAssertEqual(ConnectionState.authenticating.debugLabel, "authenticating")
        XCTAssertEqual(ConnectionState.error("x").debugLabel, "error")
    }
}
