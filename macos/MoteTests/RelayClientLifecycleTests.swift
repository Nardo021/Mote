import XCTest
@testable import Mote

final class RelayClientLifecycleTests: XCTestCase {
    func testIntentionalStopDoesNotReconnect() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        let connects = await harness.transport.connectCount
        await harness.client.stop(intentional: true)
        try? await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(harness.recorder.snapshot().last, .disconnected)
        await assertConnects(harness, connects)
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
    }

    func testTerminationIgnoresWakeAndNetworkRestore() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        harness.client.markTerminated()
        await harness.client.stop(intentional: true)
        let connects = await harness.transport.connectCount
        await harness.client.noteSystemWake()
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, connects)
        XCTAssertEqual(harness.recorder.snapshot().last, .disconnected)
    }

    func testInvalidCredentialCloseDoesNotReconnect() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: RelayCloseReason.invalidCredentials.rawValue)
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.invalidCredentials.rawValue))
        }
        try? await Task.sleep(for: .milliseconds(400))
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
        await assertConnects(harness, 1)
    }

    func testInvalidCredentialsDoNotReconnect() async {
        let harness = makeHarness()
        await harness.transport.enqueueIncoming(authError("invalid_credentials"))
        await harness.client.start()
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.invalidCredentials.rawValue))
        }
        try? await Task.sleep(for: .milliseconds(400))
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
        await assertConnects(harness, 1)
    }

    func testUnsupportedVersionDoesNotReconnect() async {
        let harness = makeHarness()
        await harness.transport.enqueueIncoming(authError("unsupported_version"))
        await harness.client.start()
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.unsupportedVersion.rawValue))
        }
        try? await Task.sleep(for: .milliseconds(400))
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
        await assertConnects(harness, 1)
    }

    func testAuthenticationTimeoutSchedulesReconnect() async {
        let harness = makeHarness(authTimeout: .milliseconds(30))
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.reconnecting) }
        XCTAssertTrue(harness.recorder.snapshot().contains(.error("Authentication timed out")))
    }

    func testUnknownCloseReasonReconnects() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: "future_reason")
        await waitUntil { harness.recorder.snapshot().contains(.reconnecting) }
        XCTAssertTrue(harness.recorder.snapshot().contains(.reconnecting))
    }

    func testSleepCancelsHeartbeatAndWakeReconnectsOnce() async {
        let harness = makeHarness(heartbeatInterval: .milliseconds(40))
        await harness.transport.enqueueIncoming(authOK)
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.connected) }
        await waitUntil { await harness.heartbeatCount >= 1 }

        await harness.client.noteSystemSleep()
        XCTAssertEqual(harness.recorder.snapshot().last, .disconnected)
        try? await Task.sleep(for: .milliseconds(30))
        let settled = await harness.heartbeatCount
        try? await Task.sleep(for: .milliseconds(180))
        await assertHeartbeats(harness, settled)

        await harness.transport.enqueueIncoming(authOK)
        await harness.client.noteSystemWake()
        await harness.client.noteSystemWake()
        await waitUntil {
            let connected = harness.recorder.snapshot().contains(.connected)
            let beats = await harness.heartbeatCount
            return connected && beats > settled
        }
        let connects = await harness.transport.connectCount
        await harness.client.noteSystemWake()
        try? await Task.sleep(for: .milliseconds(80))
        await assertConnects(harness, connects)
        await assertHeartbeatsGreaterThan(harness, settled)
    }

    func testWakeDoesNotReconnectWhenUserDisconnected() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.client.stop(intentional: true)
        let connects = await harness.transport.connectCount
        await harness.client.noteSystemWake()
        try? await Task.sleep(for: .milliseconds(150))
        await assertConnects(harness, connects)
    }

    func testSleepKeepsTerminalCredentialState() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: RelayCloseReason.credentialRotated.rawValue)
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.credentialRotated.rawValue))
        }
        await harness.client.noteSystemSleep()
        XCTAssertEqual(
            harness.recorder.snapshot().last,
            .error(RelayCloseReason.credentialRotated.rawValue)
        )
    }

    func testWakeDoesNotReconnectAfterCredentialRotation() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: RelayCloseReason.credentialRotated.rawValue)
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.credentialRotated.rawValue))
        }
        let connects = await harness.transport.connectCount
        await harness.client.noteSystemWake()
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, connects)
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
    }

    func testUnsatisfiedPathDoesNotReconnect() async {
        let harness = makeHarness()
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.start()
        try? await Task.sleep(for: .milliseconds(150))
        await assertConnects(harness, 0)
        XCTAssertTrue(harness.recorder.snapshot().contains(.error("Network unavailable")))

        await harness.client.noteNetworkPath(satisfied: true)
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: "server_shutdown")
        await waitUntil { harness.recorder.snapshot().contains(.reconnecting) }
        let connects = await harness.transport.connectCount
        await harness.client.noteNetworkPath(satisfied: false)
        try? await Task.sleep(for: .milliseconds(1_500))
        await assertConnects(harness, connects)
    }

    func testSatisfiedPathReconnectsOnceAndSkipsLiveSession() async {
        let harness = makeHarness()
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.start()
        await assertConnects(harness, 0)

        await harness.client.noteNetworkPath(satisfied: true)
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await assertConnects(harness, 1)

        await harness.transport.enqueueIncoming(authOK)
        await waitUntil { harness.recorder.snapshot().contains(.connected) }
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(120))
        await assertConnects(harness, 1)
    }

    func testAuthenticatedNetworkLossStopsTransportWithoutReconnect() async {
        let harness = makeHarness(heartbeatInterval: .milliseconds(40))
        await authenticate(harness)
        await waitUntil { await harness.heartbeatCount >= 1 }
        await harness.client.noteNetworkPath(satisfied: false)
        XCTAssertEqual(harness.recorder.snapshot().last, .error("Network unavailable"))
        await assertClosesGreaterThan(harness, 0)
        try? await Task.sleep(for: .milliseconds(30))
        let settled = await harness.heartbeatCount
        try? await Task.sleep(for: .milliseconds(180))
        await assertHeartbeats(harness, settled)
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
        await assertConnects(harness, 1)
    }

    func testNetworkRestorationStartsOneFreshConnection() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        await waitUntil(timeout: 0.4) { await harness.transport.connectCount == 2 }
        await assertConnects(harness, 2)
        XCTAssertTrue(
            harness.recorder.snapshot().contains(.reconnecting)
                || harness.recorder.snapshot().contains(.authenticating)
        )
    }

    func testRepeatedNetworkRestorationDoesNotDuplicateConnect() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        await harness.client.noteNetworkPath(satisfied: true)
        await waitUntil(timeout: 0.4) { await harness.transport.connectCount == 2 }
        try? await Task.sleep(for: .milliseconds(150))
        await assertConnects(harness, 2)
    }

    func testStaleCloseAfterRestorationDoesNotDropNewGeneration() async {
        let sequence = TransportSequence()
        let recorder = ConnectionStateRecorder()
        let client = RelayClient(
            deviceID: "7B0F0000-0000-0000-0000-0000000091AC",
            configurationProvider: {
                RelayConfiguration(baseURL: URL(string: "https://relay.example.net")!)
            },
            credentialProvider: { "device-credential" },
            transportFactory: { _ in sequence.next() },
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
        await waitUntil {
            sequence.transports.count == 1 && recorder.snapshot().contains(.authenticating)
        }
        await sequence.transports[0].enqueueIncoming(authOK)
        await waitUntil { recorder.snapshot().contains(.connected) }
        await client.noteNetworkPath(satisfied: false)
        await waitUntil { recorder.snapshot().contains(.error("Network unavailable")) }
        await sequence.transports[0].closeFromServer(reason: "socket_error")
        await client.noteNetworkPath(satisfied: true)
        await waitUntil {
            sequence.transports.count == 2 && recorder.snapshot().contains(.authenticating)
        }
        await sequence.transports[1].enqueueIncoming(authOK)
        await waitUntil { recorder.snapshot().last == .connected }
        await sequence.transports[0].closeFromServer(reason: "server_shutdown")
        try? await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(recorder.snapshot().last, .connected)
        XCTAssertEqual(sequence.transports.count, 2)
    }

    func testStaleAuthCallbackDoesNotAffectNewGeneration() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.transport.deliverOnNextClose(authError("invalid_credentials"))
        await harness.client.noteNetworkPath(satisfied: false)
        XCTAssertEqual(harness.recorder.snapshot().last, .error("Network unavailable"))
        XCTAssertFalse(
            harness.recorder.snapshot().contains(.error(RelayCloseReason.invalidCredentials.rawValue))
        )
        await harness.client.noteNetworkPath(satisfied: true)
        await harness.transport.enqueueIncoming(authOK)
        await waitUntil(timeout: 0.4) {
            let connects = await harness.transport.connectCount
            return connects == 2 && harness.recorder.snapshot().last == .connected
        }
        await assertConnects(harness, 2)
        XCTAssertEqual(harness.recorder.snapshot().last, .connected)
        XCTAssertFalse(
            harness.recorder.snapshot().contains(.error(RelayCloseReason.invalidCredentials.rawValue))
        )
    }

    func testNetworkRestorationWhileConnectingDoesNotDuplicate() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.client.noteNetworkPath(satisfied: false)
        XCTAssertEqual(harness.recorder.snapshot().last, .error("Network unavailable"))
        await harness.client.noteNetworkPath(satisfied: true)
        await waitUntil(timeout: 0.4) { await harness.transport.connectCount == 2 }
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(150))
        await assertConnects(harness, 2)
    }

    func testNetworkRestorationWhileAuthenticatedDoesNotDuplicate() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteNetworkPath(satisfied: true)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(150))
        await assertConnects(harness, 1)
        XCTAssertEqual(harness.recorder.snapshot().last, .connected)
    }

    func testUserDisconnectSurvivesNetworkTransition() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.stop(intentional: true)
        let connects = await harness.transport.connectCount
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, connects)
        XCTAssertEqual(harness.recorder.snapshot().last, .disconnected)
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
    }

    func testInvalidCredentialsSurviveNetworkTransition() async {
        let harness = makeHarness()
        await harness.transport.enqueueIncoming(authError("invalid_credentials"))
        await harness.client.start()
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.invalidCredentials.rawValue))
        }
        let connects = await harness.transport.connectCount
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, connects)
        XCTAssertEqual(
            harness.recorder.snapshot().last,
            .error(RelayCloseReason.invalidCredentials.rawValue)
        )
    }

    func testCredentialRotationSurvivesNetworkTransition() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: RelayCloseReason.credentialRotated.rawValue)
        await waitUntil {
            harness.recorder.snapshot().contains(.error(RelayCloseReason.credentialRotated.rawValue))
        }
        let connects = await harness.transport.connectCount
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, connects)
        XCTAssertEqual(
            harness.recorder.snapshot().last,
            .error(RelayCloseReason.credentialRotated.rawValue)
        )
    }

    func testDeviceDisabledSurvivesNetworkTransition() async {
        let harness = makeHarness()
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.authenticating) }
        await harness.transport.closeFromServer(reason: RelayCloseReason.deviceDisabled.rawValue)
        await waitUntil { harness.recorder.snapshot().contains(.disabled) }
        let connects = await harness.transport.connectCount
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, connects)
        XCTAssertEqual(harness.recorder.snapshot().last, .disabled)
    }

    func testSleepThenNetworkFlapDoesNotReconnectWhileSleeping() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteSystemSleep()
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, 1)
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
    }

    func testWakeWhileNetworkUnavailableWaitsForRestore() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteSystemSleep()
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteSystemWake()
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, 1)
        await harness.client.noteNetworkPath(satisfied: true)
        await waitUntil(timeout: 0.4) { await harness.transport.connectCount == 2 }
        await assertConnects(harness, 2)
    }

    func testNetworkReturnsDuringSleepAndWakeReconnectsOnce() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteSystemSleep()
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        await assertConnects(harness, 1)
        await harness.client.noteSystemWake()
        await harness.client.noteSystemWake()
        await waitUntil(timeout: 0.4) { await harness.transport.connectCount == 2 }
        try? await Task.sleep(for: .milliseconds(120))
        await assertConnects(harness, 2)
    }

    func testNetworkLossBeforeSleepReconnectsOnceOnWake() async {
        let harness = makeHarness()
        await authenticate(harness)
        await harness.client.noteNetworkPath(satisfied: false)
        XCTAssertEqual(harness.recorder.snapshot().last, .error("Network unavailable"))
        await harness.client.noteSystemSleep()
        await harness.client.noteNetworkPath(satisfied: true)
        await assertConnects(harness, 1)
        await harness.client.noteSystemWake()
        await waitUntil(timeout: 0.4) { await harness.transport.connectCount == 2 }
        await assertConnects(harness, 2)
    }

    func testTerminationIgnoresNetworkRestoration() async {
        let harness = makeHarness()
        await authenticate(harness)
        harness.client.markTerminated()
        await harness.client.noteNetworkPath(satisfied: false)
        await harness.client.noteNetworkPath(satisfied: true)
        try? await Task.sleep(for: .milliseconds(200))
        await assertConnects(harness, 1)
        XCTAssertFalse(harness.recorder.snapshot().contains(.reconnecting))
    }

    private func authenticate(_ harness: RelayHarness) async {
        await harness.transport.enqueueIncoming(authOK)
        await harness.client.start()
        await waitUntil { harness.recorder.snapshot().contains(.connected) }
    }

    private func makeHarness(
        heartbeatInterval: Duration = .seconds(30),
        authTimeout: Duration = .seconds(10)
    ) -> RelayHarness {
        let transport = MockRelayTransport()
        let recorder = ConnectionStateRecorder()
        let client = RelayClient(
            deviceID: "7B0F0000-0000-0000-0000-0000000091AC",
            configurationProvider: {
                RelayConfiguration(baseURL: URL(string: "https://relay.example.net")!)
            },
            credentialProvider: { "device-credential" },
            transportFactory: { _ in transport },
            events: RelayClientEvents(
                onState: { recorder.record($0) },
                onLatency: { _ in },
                onError: { _ in },
                onCommand: { command in
                    .status(.failed, commandID: command.id, error: "unused")
                }
            ),
            heartbeatInterval: heartbeatInterval,
            authTimeout: authTimeout
        )
        return RelayHarness(client: client, transport: transport, recorder: recorder)
    }

    private func assertConnects(
        _ harness: RelayHarness,
        _ expected: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let observed = await harness.transport.connectCount
        XCTAssertEqual(observed, expected, file: file, line: line)
    }

    private func assertHeartbeats(
        _ harness: RelayHarness,
        _ expected: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let observed = await harness.heartbeatCount
        XCTAssertEqual(observed, expected, file: file, line: line)
    }

    private func assertHeartbeatsGreaterThan(
        _ harness: RelayHarness,
        _ minimum: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let observed = await harness.heartbeatCount
        XCTAssertGreaterThan(observed, minimum, file: file, line: line)
    }

    private func assertClosesGreaterThan(
        _ harness: RelayHarness,
        _ minimum: Int,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let observed = await harness.transport.closeCount
        XCTAssertGreaterThan(observed, minimum, file: file, line: line)
    }

    private func waitUntil(timeout: TimeInterval = 1.5, _ predicate: () async -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await predicate() { return }
            try? await Task.sleep(for: .milliseconds(20))
        }
    }
}

private struct RelayHarness {
    let client: RelayClient
    let transport: MockRelayTransport
    let recorder: ConnectionStateRecorder

    var heartbeatCount: Int {
        get async {
            await transport.messageTypes().filter { $0 == "heartbeat" }.count
        }
    }
}

private let authOK = Data(#"{"type":"auth_result","version":1,"status":"ok"}"#.utf8)

private func authError(_ error: String) -> Data {
    Data(#"{"type":"auth_result","version":1,"status":"error","error":"\#(error)"}"#.utf8)
}

private final class TransportSequence: @unchecked Sendable {
    private let lock = NSLock()
    private var items: [MockRelayTransport] = []

    func next() -> any MessageTransport {
        let created = MockRelayTransport()
        lock.lock()
        items.append(created)
        lock.unlock()
        return created
    }

    var transports: [MockRelayTransport] {
        lock.lock()
        defer { lock.unlock() }
        return items
    }
}
