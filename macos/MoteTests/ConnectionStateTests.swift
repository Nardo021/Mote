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
        XCTAssertEqual(ConnectionState.disabled.title, "Disabled")
        XCTAssertEqual(ConnectionState.notConfigured.title, "Not Configured")
        XCTAssertEqual(ConnectionState.pairing.title, "Waiting for Approval…")
    }

    func testMenuTitlesIncludeSymbolAndText() {
        XCTAssertEqual(ConnectionState.connected.menuTitle, "● Connected")
        XCTAssertEqual(ConnectionState.pairing.menuTitle, "◌ Waiting for Approval…")
        XCTAssertEqual(ConnectionState.connecting.menuTitle, "◌ Connecting…")
        XCTAssertEqual(ConnectionState.disconnected.menuTitle, "○ Disconnected")
        XCTAssertEqual(ConnectionState.error("invalid_credentials").menuTitle, "● Connection Error")
        XCTAssertEqual(ConnectionState.disabled.menuTitle, "● Disabled")
    }

    func testDebugLabelsAreRawStateNames() {
        XCTAssertEqual(ConnectionState.connected.debugLabel, "connected")
        XCTAssertEqual(ConnectionState.pairing.debugLabel, "pairing")
        XCTAssertEqual(ConnectionState.authenticating.debugLabel, "authenticating")
        XCTAssertEqual(ConnectionState.error("x").debugLabel, "error")
        XCTAssertEqual(ConnectionState.disabled.debugLabel, "disabled")
    }

    func testStatusToneMatchesConnectionHealth() {
        XCTAssertEqual(ConnectionState.connected.statusTone(persistWarning: false), .success)
        XCTAssertEqual(ConnectionState.pairing.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.connecting.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.authenticating.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.reconnecting.statusTone(persistWarning: false), .accent)
        XCTAssertEqual(ConnectionState.reconnecting.statusTone(persistWarning: true), .warning)
        XCTAssertEqual(ConnectionState.error("Relay unavailable").statusTone(persistWarning: false), .error)
        XCTAssertEqual(ConnectionState.disabled.statusTone(persistWarning: false), .warning)
        XCTAssertEqual(ConnectionState.disconnected.statusTone(persistWarning: false), .offline)
        XCTAssertEqual(ConnectionState.notConfigured.statusTone(persistWarning: false), .offline)
    }
}
