import XCTest
@testable import Mote

final class RelayClientCloseReasonTests: XCTestCase {
    func testDeviceDisabledStopsReconnect() async {
        let recorder = await runUntilClose(reason: RelayCloseReason.deviceDisabled.rawValue)
        XCTAssertTrue(recorder.snapshot().contains(.disabled))
        try? await Task.sleep(for: .milliseconds(1_300))
        XCTAssertEqual(recorder.snapshot().last, .disabled)
        XCTAssertFalse(recorder.snapshot().contains(.reconnecting))
    }

    func testCredentialRotatedStopsReconnect() async {
        let recorder = await runUntilClose(reason: RelayCloseReason.credentialRotated.rawValue)
        XCTAssertTrue(recorder.snapshot().contains(.error(RelayCloseReason.credentialRotated.rawValue)))
        try? await Task.sleep(for: .milliseconds(1_300))
        XCTAssertEqual(recorder.snapshot().last, .error(RelayCloseReason.credentialRotated.rawValue))
        XCTAssertFalse(recorder.snapshot().contains(.reconnecting))
    }

    func testOrdinaryCloseStillReconnects() async {
        let recorder = await runUntilClose(reason: "server_shutdown")
        let deadline = Date().addingTimeInterval(2.0)
        while Date() < deadline, !recorder.snapshot().contains(.reconnecting) {
            try? await Task.sleep(for: .milliseconds(40))
        }
        XCTAssertTrue(recorder.snapshot().contains(.reconnecting))
    }

    private func runUntilClose(reason: String) async -> ConnectionStateRecorder {
        let transport = MockRelayTransport()
        let recorder = ConnectionStateRecorder()
        let client = RelayClient(
            deviceID: "7B0F0000-0000-0000-0000-0000000091AC",
            configurationProvider: { RelayConfiguration.resolve() },
            credentialProvider: { "device-credential" },
            transportFactory: { _ in transport },
            events: RelayClientEvents(
                onState: { recorder.record($0) },
                onLatency: { _ in },
                onError: { _ in },
                onCommand: { command in
                    .status(.failed, commandID: command.id, error: "unused")
                }
            )
        )

        await client.start()
        let deadline = Date().addingTimeInterval(1.0)
        while Date() < deadline {
            if recorder.snapshot().contains(.authenticating) {
                break
            }
            try? await Task.sleep(for: .milliseconds(20))
        }
        await transport.closeFromServer(reason: reason)

        let settleDeadline = Date().addingTimeInterval(1.0)
        while Date() < settleDeadline {
            let states = recorder.snapshot()
            if states.contains(.disabled)
                || states.contains(.error(RelayCloseReason.credentialRotated.rawValue))
                || states.contains(.reconnecting)
                || states.contains(.error("Relay unavailable"))
            {
                break
            }
            try? await Task.sleep(for: .milliseconds(20))
        }
        return recorder
    }
}

final class ConnectionStateRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var states: [ConnectionState] = []

    func record(_ state: ConnectionState) {
        lock.lock()
        states.append(state)
        lock.unlock()
    }

    func snapshot() -> [ConnectionState] {
        lock.lock()
        defer { lock.unlock() }
        return states
    }
}
