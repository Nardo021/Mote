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

    func testStatusToneMatchesConnectionHealth() {
        XCTAssertEqual(ConnectionState.connected.statusTone(persistWarning: false), .success)
        XCTAssertEqual(ConnectionState.connecting.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.authenticating.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.reconnecting.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.reconnecting.statusTone(persistWarning: true), .warning)
        XCTAssertEqual(ConnectionState.error("Relay unavailable").statusTone(persistWarning: false), .error)
        XCTAssertEqual(ConnectionState.disconnected.statusTone(persistWarning: false), .offline)
        XCTAssertEqual(ConnectionState.notConfigured.statusTone(persistWarning: false), .offline)
    }
}
