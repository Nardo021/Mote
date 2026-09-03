import XCTest
@testable import Mote

final class ConnectionStatusCopyTests: XCTestCase {
    func testUnconfiguredHidesConnectionDetails() {
        XCTAssertFalse(ConnectionStatusCopy.showsConfiguredDetails(.notConfigured))
        XCTAssertNil(ConnectionStatusCopy.headerTransportLine(state: .notConfigured, latencyText: "4 ms"))
        XCTAssertNil(ConnectionStatusCopy.menuRelayLine(host: "relay.yanze.me", latencyText: "4 ms", state: .notConfigured))
    }

    func testConnectedTransportLines() {
        XCTAssertEqual(
            ConnectionStatusCopy.headerTransportLine(state: .connected, latencyText: "4 ms"),
            "Relay · 4 ms"
        )
        XCTAssertEqual(
            ConnectionStatusCopy.menuRelayLine(host: "relay.yanze.me", latencyText: "4 ms", state: .connected),
            "relay.yanze.me · 4 ms"
        )
    }

    func testDisconnectedDoesNotInventLatency() {
        XCTAssertNil(ConnectionStatusCopy.headerTransportLine(state: .disconnected, latencyText: "0 ms"))
        XCTAssertNil(ConnectionStatusCopy.menuRelayLine(host: "relay.yanze.me", latencyText: "0 ms", state: .disconnected))
    }

    func testInlineErrors() {
        let retrying = ConnectionStatusCopy.inlineError(state: .reconnecting, lastError: "Relay unavailable")
        XCTAssertEqual(retrying?.title, "Could not connect to relay.")
        XCTAssertEqual(retrying?.detail, "Retrying automatically…")

        let invalid = ConnectionStatusCopy.inlineError(state: .error("invalid_credentials"), lastError: "invalid_credentials")
        XCTAssertEqual(invalid?.title, "Device credential is invalid.")

        XCTAssertNil(ConnectionStatusCopy.inlineError(state: .connected, lastError: nil))
        XCTAssertNil(ConnectionStatusCopy.inlineError(state: .disconnected, lastError: "Could not update Start at Login"))
        XCTAssertTrue(ConnectionStatusCopy.isStartupError("Could not update Start at Login"))
    }

    func testLockActionStatus() {
        XCTAssertEqual(ConnectionStatusCopy.lockActionStatus(permissionGranted: true), "Available")
        XCTAssertEqual(ConnectionStatusCopy.lockActionStatus(permissionGranted: false), "Unavailable")
    }
}
