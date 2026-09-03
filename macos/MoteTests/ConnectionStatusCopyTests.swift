import XCTest
@testable import Mote

final class ConnectionStatusCopyTests: XCTestCase {
    func testUnconfiguredHidesConnectionDetails() {
        XCTAssertFalse(ConnectionStatusCopy.showsConfiguredDetails(.notConfigured))
        XCTAssertFalse(ConnectionStatusCopy.showsConfiguredDetails(.pairing))
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
        XCTAssertEqual(invalid?.detail, "Paste the new credential from the Dashboard.")

        let rotated = ConnectionStatusCopy.inlineError(
            state: .error(RelayCloseReason.credentialRotated.rawValue),
            lastError: RelayCloseReason.credentialRotated.rawValue
        )
        XCTAssertEqual(rotated?.title, "The device credential was replaced.")
        XCTAssertEqual(rotated?.detail, "Paste the new credential from the Dashboard.")

        let disabled = ConnectionStatusCopy.inlineError(state: .disabled, lastError: RelayCloseReason.deviceDisabled.rawValue)
        XCTAssertEqual(disabled?.title, "This Mac is disabled.")
        XCTAssertEqual(disabled?.detail, "Enable this Mac in the Dashboard, then Reconnect.")

        let pairing = ConnectionStatusCopy.inlineError(state: .pairing, lastError: "Pairing was denied.")
        XCTAssertEqual(pairing?.title, "Pairing was denied.")
        XCTAssertEqual(pairing?.detail, "Allow this Mac in the Dashboard, then pair again.")

        let expired = ConnectionStatusCopy.inlineError(state: .notConfigured, lastError: "Pairing expired. Try again.")
        XCTAssertEqual(expired?.title, "Pairing expired.")
        XCTAssertEqual(expired?.detail, "Try again.")

        let keychain = ConnectionStatusCopy.inlineError(state: .error("Keychain failure"), lastError: "Keychain failure")
        XCTAssertEqual(keychain?.title, "Could not read the device credential.")
        XCTAssertEqual(keychain?.detail, "Try again. If it continues, check the Keychain item for this Mac.")

        XCTAssertNil(ConnectionStatusCopy.inlineError(state: .connected, lastError: nil))
        XCTAssertNil(ConnectionStatusCopy.inlineError(state: .disconnected, lastError: "Could not update Start at Login"))
        XCTAssertTrue(ConnectionStatusCopy.isStartupError("Could not update Start at Login"))
        XCTAssertEqual(
            ConnectionStatusCopy.startupErrorText("Could not update Start at Login"),
            "Could not update Start at Login. Try again."
        )
    }

    func testUnknownPairingErrorDoesNotSurfaceRawPipelineText() {
        let error = ConnectionStatusCopy.inlineError(state: .notConfigured, lastError: "socket reset")
        XCTAssertEqual(error?.title, "Could not start pairing.")
        XCTAssertEqual(error?.detail, "Check the network and pair again.")
    }

    func testCredentialPasteIsOnlyForRecoveryStates() {
        XCTAssertTrue(
            ConnectionStatusCopy.needsCredentialPaste(
                state: .error(RelayCloseReason.credentialRotated.rawValue),
                lastError: RelayCloseReason.credentialRotated.rawValue
            )
        )
        XCTAssertTrue(
            ConnectionStatusCopy.needsCredentialPaste(
                state: .error("invalid_credentials"),
                lastError: "invalid_credentials"
            )
        )
        XCTAssertFalse(
            ConnectionStatusCopy.needsCredentialPaste(
                state: .disabled,
                lastError: RelayCloseReason.deviceDisabled.rawValue
            )
        )
        XCTAssertFalse(ConnectionStatusCopy.needsCredentialPaste(state: .connected, lastError: nil))
        XCTAssertFalse(ConnectionStatusCopy.needsCredentialPaste(state: .notConfigured, lastError: nil))
    }

    func testLatencyKeepsNumberAndUnitTogether() {
        XCTAssertEqual(DateHelpers.formatLatency(0.004), "4\u{00A0}ms")
        XCTAssertEqual(
            ConnectionStatusCopy.headerTransportLine(state: .connected, latencyText: DateHelpers.formatLatency(0.004)),
            "Relay · 4\u{00A0}ms"
        )
    }
}
