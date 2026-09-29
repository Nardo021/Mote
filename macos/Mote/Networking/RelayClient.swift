import AppKit
import Foundation
import Network
import os

struct RelayClientEvents: Sendable {
    var onState: @Sendable (ConnectionState) -> Void
    var onLatency: @Sendable (TimeInterval?) -> Void
    var onError: @Sendable (String?) -> Void
    var onCommand: @Sendable (MoteCommand) async -> MoteCommandResult
}

actor RelayClient {
    private let deviceID: String
    private let configurationProvider: @Sendable () -> RelayConfiguration?
    private let credentialProvider: @Sendable () async throws -> String?
    private let transportFactory: @Sendable (URL) -> any MessageTransport
    private let events: RelayClientEvents
    private let heartbeatInterval: Duration
    private let authTimeout: Duration

    private var transport: (any MessageTransport)?
    private var generation: UInt64 = 0
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var authTimeoutTask: Task<Void, Never>?
    private var stableResetTask: Task<Void, Never>?
    private var pathMonitor: NWPathMonitor?
    private var pathQueue = DispatchQueue(label: "\(AppIdentity.bundleID).path")
    private var sleepObserver: NSObjectProtocol?
    private var wakeObserver: NSObjectProtocol?
    private let terminated = OSAllocatedUnfairLock(initialState: false)

    private var intentionalDisconnect = false
    private var systemSleeping = false
    private var networkSatisfied = true
    private var connectInFlight = false
    private var isAuthenticated = false
    private var reconnectAttempt = 0
    private var policy = ReconnectPolicy()
    private var lastError: String?

    init(
        deviceID: String,
        configurationProvider: @escaping @Sendable () -> RelayConfiguration?,
        credentialProvider: @escaping @Sendable () async throws -> String?,
        transportFactory: @escaping @Sendable (URL) -> any MessageTransport = { WebSocketTransport(url: $0) },
        events: RelayClientEvents,
        heartbeatInterval: Duration = .seconds(ProtocolConstants.heartbeatIntervalSeconds),
        authTimeout: Duration = .seconds(ProtocolConstants.authTimeoutSeconds)
    ) {
        self.deviceID = deviceID
        self.configurationProvider = configurationProvider
        self.credentialProvider = credentialProvider
        self.transportFactory = transportFactory
        self.events = events
        self.heartbeatInterval = heartbeatInterval
        self.authTimeout = authTimeout
    }

    nonisolated func markTerminated() {
        terminated.withLock { $0 = true }
    }

    func start() async {
        guard !isTerminated() else { return }
        systemSleeping = false
        intentionalDisconnect = false
        startObserversIfNeeded()
        await connect(isReconnect: false, resetBackoff: true)
    }

    func stop(intentional: Bool) async {
        intentionalDisconnect = intentional
        connectInFlight = false
        generation += 1
        if intentional {
            stopObservers()
        }
        await tearDownSocket()
        isAuthenticated = false
        events.onLatency(nil)
        if intentional {
            lastError = nil
            events.onError(nil)
            events.onState(.disconnected)
            MoteLog.agent.info("Intentional disconnect")
        }
    }

    func requestConnect() async {
        guard !isTerminated() else { return }
        systemSleeping = false
        intentionalDisconnect = false
        startObserversIfNeeded()
        await connect(isReconnect: false, resetBackoff: true)
    }

    func noteSystemSleep() async {
        guard !systemSleeping else { return }
        systemSleeping = true
        connectInFlight = false
        generation += 1
        let preserveTerminalState = intentionalDisconnect
        isAuthenticated = false
        await tearDownSocket()
        events.onLatency(nil)
        if !preserveTerminalState {
            lastError = nil
            events.onError(nil)
            events.onState(.disconnected)
        }
        MoteLog.network.info("System sleep")
    }

    func noteSystemWake() async {
        systemSleeping = false
        MoteLog.network.info("System wake")
        await recoverIfNeeded()
    }

    func noteNetworkPath(satisfied: Bool) async {
        if satisfied {
            await noteNetworkRestored()
        } else {
            await noteNetworkLost()
        }
    }

    private func noteNetworkLost() async {
        let becameUnavailable = networkSatisfied
        networkSatisfied = false
        reconnectTask?.cancel()
        reconnectTask = nil
        guard becameUnavailable else { return }

        if isTerminated() {
            await invalidateTransportForNetworkLoss()
            MoteLog.network.info("Network unavailable")
            return
        }
        if intentionalDisconnect {
            MoteLog.network.info("Network unavailable")
            return
        }

        let invalidatedGeneration = await invalidateTransportForNetworkLoss()
        MoteLog.network.info("Network unavailable")
        let stillCurrent = invalidatedGeneration == nil || generation == invalidatedGeneration
        guard stillCurrent, !networkSatisfied, !systemSleeping, !intentionalDisconnect, !isTerminated() else {
            return
        }
        events.onError("Network unavailable")
        events.onState(.error("Network unavailable"))
    }

    /// Drops the live transport generation. Returns that generation when a live
    /// transport was invalidated, otherwise nil.
    private func invalidateTransportForNetworkLoss() async -> UInt64? {
        let live = isAuthenticated || transport != nil || connectInFlight || heartbeatTask != nil || receiveTask != nil
        guard live else { return nil }
        connectInFlight = false
        generation += 1
        let invalidatedGeneration = generation
        isAuthenticated = false
        await tearDownSocket()
        events.onLatency(nil)
        MoteLog.network.info("Active transport invalidated because network disappeared")
        return invalidatedGeneration
    }

    private func noteNetworkRestored() async {
        let becameAvailable = !networkSatisfied
        networkSatisfied = true
        guard becameAvailable else { return }
        MoteLog.network.info("Network restored")
        guard canAttemptConnection else { return }
        MoteLog.network.info("Reconnect started because network returned")
        await recoverIfNeeded()
    }

    private var canContinueConnectionAttempt: Bool {
        !isTerminated() && !intentionalDisconnect && !systemSleeping && networkSatisfied
    }

    private var canAttemptConnection: Bool {
        canContinueConnectionAttempt && !isAuthenticated && !connectInFlight
    }

    private func connect(isReconnect: Bool, resetBackoff: Bool) async {
        if resetBackoff {
            reconnectAttempt = 0
        }

        guard canAttemptConnection else { return }
        connectInFlight = true
        let attemptGeneration = generation

        let credential: String?
        do {
            credential = try await credentialProvider()
        } catch {
            if generation == attemptGeneration {
                connectInFlight = false
                lastError = "Keychain failure"
                events.onError(lastError)
                events.onState(.error("Keychain failure"))
                MoteLog.security.error("Failed to read device credential")
            }
            return
        }

        guard generation == attemptGeneration else { return }
        guard canContinueConnectionAttempt else {
            connectInFlight = false
            return
        }

        guard let credential, !credential.isEmpty else {
            connectInFlight = false
            events.onState(.notConfigured)
            return
        }

        guard let configuration = configurationProvider() else {
            connectInFlight = false
            events.onState(.notConfigured)
            MoteLog.network.info("Relay URL is not configured")
            return
        }

        guard generation == attemptGeneration else { return }
        guard canContinueConnectionAttempt else {
            connectInFlight = false
            return
        }

        generation += 1
        let gen = generation
        await tearDownSocket()
        guard gen == generation, canContinueConnectionAttempt else {
            if gen == generation {
                connectInFlight = false
            }
            return
        }
        isAuthenticated = false
        events.onLatency(nil)
        events.onState(isReconnect ? .reconnecting : .connecting)
        MoteLog.network.info("Connection attempt")

        let nextTransport = transportFactory(configuration.webSocketURL)
        transport = nextTransport

        do {
            try await nextTransport.connect()
            guard gen == generation, canContinueConnectionAttempt else {
                if gen == generation {
                    connectInFlight = false
                }
                return
            }
            events.onState(.authenticating)
            try await sendJSON(
                AuthMessage(deviceID: deviceID, credential: credential, appVersion: AppVersion.display),
                generation: gen
            )
            startReceiveLoop(generation: gen)
            startAuthTimeout(generation: gen)
        } catch {
            if gen != generation {
                return
            }
            connectInFlight = false
            if !canContinueConnectionAttempt {
                return
            }
            let message = Self.userFacingMessage(for: error)
            lastError = message
            events.onError(message)
            events.onState(.error(message))
            MoteLog.network.error("Connection attempt failed")
            await scheduleReconnect()
        }
    }

    private func startReceiveLoop(generation gen: UInt64) {
        receiveTask = Task {
            await self.receiveLoop(generation: gen)
        }
    }

    private func receiveLoop(generation gen: UInt64) async {
        guard let transport else { return }
        while !Task.isCancelled, gen == generation {
            do {
                let data = try await transport.receive()
                await handle(data, generation: gen)
            } catch {
                if Task.isCancelled || gen != generation || intentionalDisconnect || systemSleeping || !networkSatisfied {
                    return
                }
                if await handleReceiveFailure(error, generation: gen) {
                    return
                }
                MoteLog.network.error("Connection lost")
                await handleUnexpectedDisconnect(generation: gen)
                return
            }
        }
    }

    private func handle(_ data: Data, generation gen: UInt64) async {
        guard gen == generation else { return }

        let message: IncomingRelayMessage
        do {
            message = try IncomingRelayMessage.decode(from: data)
        } catch {
            MoteLog.network.error("Invalid JSON from Relay")
            return
        }

        switch message {
        case .authResult(let result):
            await handleAuthResult(result, generation: gen)

        case .heartbeatAck(let ack):
            handleHeartbeatAck(ack)

        case .command(let command):
            guard isAuthenticated else {
                MoteLog.commands.error("Ignored command before authentication")
                return
            }
            let result = await events.onCommand(command)
            do {
                try await sendJSON(result, generation: gen)
            } catch {
                MoteLog.network.error("Failed to send command result")
            }

        case .error(let error):
            let message = error.error ?? "Relay error"
            lastError = message
            events.onError(message)
            MoteLog.network.error("Relay error frame")

        case .unknown(let type):
            MoteLog.network.error("Unknown Relay message type \(type, privacy: .public)")
        }
    }

    private func handleAuthResult(_ result: AuthResultMessage, generation gen: UInt64) async {
        guard gen == generation else { return }
        authTimeoutTask?.cancel()
        authTimeoutTask = nil

        guard result.isSuccessful else {
            await handleAuthenticationFailure(result.error, generation: gen)
            return
        }

        connectInFlight = false
        isAuthenticated = true
        lastError = nil
        events.onError(nil)
        events.onState(.connected)
        MoteLog.network.info("Authenticated")
        startHeartbeat(generation: gen)
        startStableReset(generation: gen)
    }

    private func handleHeartbeatAck(_ ack: HeartbeatAckMessage) {
        let now = DateHelpers.nowMilliseconds()
        let roundTrip = TimeInterval(now - ack.sentAt) / 1000.0
        if roundTrip >= 0, roundTrip < 60 {
            events.onLatency(roundTrip)
        }
    }

    private func startHeartbeat(generation gen: UInt64) {
        heartbeatTask?.cancel()
        let manager = HeartbeatManager(interval: heartbeatInterval)
        heartbeatTask = Task {
            await manager.run { [weak self] in
                try await self?.sendHeartbeat(generation: gen)
            }
        }
    }

    private func sendHeartbeat(generation gen: UInt64) async throws {
        guard gen == generation, isAuthenticated, !systemSleeping, networkSatisfied else { return }
        let message = HeartbeatMessage(deviceID: deviceID, sentAt: DateHelpers.nowMilliseconds())
        try await sendJSON(message, generation: gen)
    }

    private func startAuthTimeout(generation gen: UInt64) {
        authTimeoutTask?.cancel()
        authTimeoutTask = Task {
            try? await Task.sleep(for: authTimeout)
            await self.authTimedOut(generation: gen)
        }
    }

    private func authTimedOut(generation gen: UInt64) async {
        guard gen == generation, !isAuthenticated, canContinueConnectionAttempt else {
            return
        }
        connectInFlight = false
        lastError = "Authentication timed out"
        events.onError(lastError)
        events.onState(.error("Authentication timed out"))
        MoteLog.network.error("Authentication timed out")
        await handleUnexpectedDisconnect(generation: gen)
    }

    private func startStableReset(generation gen: UInt64) {
        stableResetTask?.cancel()
        stableResetTask = Task {
            try? await Task.sleep(for: .seconds(ProtocolConstants.stableConnectionResetSeconds))
            self.resetBackoffIfStable(generation: gen)
        }
    }

    private func resetBackoffIfStable(generation gen: UInt64) {
        guard gen == generation, isAuthenticated else { return }
        reconnectAttempt = 0
    }

    private func handleReceiveFailure(_ error: Error, generation gen: UInt64) async -> Bool {
        guard let transportError = error as? TransportError else {
            return false
        }
        switch transportError {
        case .cancelled:
            return true
        case .closed(let reason):
            if let reason {
                MoteLog.network.info("Socket closed \(reason, privacy: .public)")
            }
            return await handleAdministrativeClose(reason, generation: gen)
        case .notConnected, .invalidUTF8, .invalidRelayResponse:
            return false
        }
    }

    private func handleAdministrativeClose(_ reason: String?, generation gen: UInt64) async -> Bool {
        guard let reason, let closeReason = RelayCloseReason(rawValue: reason), closeReason.stopsReconnect else {
            if let reason, RelayCloseReason(rawValue: reason) == nil {
                MoteLog.network.info("Unknown close reason \(reason, privacy: .public)")
            }
            return false
        }
        intentionalDisconnect = true
        await settleAdministrativeClose(generation: gen, reason: closeReason)
        return true
    }

    private func handleAuthenticationFailure(_ error: String?, generation gen: UInt64) async {
        if lastError == RelayCloseReason.deviceDisabled.rawValue {
            await settleAdministrativeClose(generation: gen, reason: .deviceDisabled)
            return
        }
        if lastError == RelayCloseReason.credentialRotated.rawValue {
            await settleAdministrativeClose(generation: gen, reason: .credentialRotated)
            return
        }

        let message = error ?? RelayCloseReason.invalidCredentials.rawValue
        if let closeReason = RelayCloseReason(rawValue: message), closeReason.stopsReconnect {
            await settleAdministrativeClose(generation: gen, reason: closeReason)
            return
        }

        connectInFlight = false
        lastError = message
        events.onError(message)
        events.onState(.error(message))
        intentionalDisconnect = true
        generation += 1
        await tearDownSocket()
        MoteLog.network.error("Terminal authentication state")
    }

    private func settleAdministrativeClose(generation gen: UInt64, reason: RelayCloseReason) async {
        guard gen == generation else { return }
        intentionalDisconnect = true
        connectInFlight = false
        lastError = reason.rawValue
        events.onError(reason.rawValue)
        switch reason {
        case .deviceDisabled:
            events.onState(.disabled)
        case .credentialRotated, .invalidCredentials, .unsupportedVersion:
            events.onState(.error(reason.rawValue))
        case .authTimeout, .heartbeatStale, .superseded, .expired, .serverShutdown, .socketError:
            break
        }
        generation += 1
        isAuthenticated = false
        events.onLatency(nil)
        await tearDownSocket()
        MoteLog.network.error("Terminal credential condition \(reason.rawValue, privacy: .public)")
    }

    private func handleUnexpectedDisconnect(generation gen: UInt64) async {
        guard gen == generation else { return }
        connectInFlight = false
        generation += 1
        isAuthenticated = false
        events.onLatency(nil)
        await tearDownSocket()
        MoteLog.network.info("Disconnect transient")
        await scheduleReconnect()
    }

    private func scheduleReconnect() async {
        guard canAttemptConnection else { return }
        reconnectTask?.cancel()
        let attempt = reconnectAttempt
        reconnectAttempt += 1
        let delay = policy.delay(forAttempt: attempt)
        events.onState(.reconnecting)
        MoteLog.network.info("Reconnect scheduled in \(delay, format: .fixed(precision: 1), privacy: .public)s")
        reconnectTask = Task {
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self.beginScheduledReconnect()
        }
    }

    private func beginScheduledReconnect() async {
        reconnectTask = nil
        guard canAttemptConnection else { return }
        await connect(isReconnect: true, resetBackoff: false)
    }

    private func recoverIfNeeded() async {
        guard canAttemptConnection else { return }
        reconnectTask?.cancel()
        reconnectTask = nil
        await connect(isReconnect: true, resetBackoff: true)
    }

    private func tearDownSocket() async {
        receiveTask?.cancel()
        heartbeatTask?.cancel()
        reconnectTask?.cancel()
        authTimeoutTask?.cancel()
        stableResetTask?.cancel()
        receiveTask = nil
        heartbeatTask = nil
        reconnectTask = nil
        authTimeoutTask = nil
        stableResetTask = nil
        isAuthenticated = false
        await transport?.close(reason: "client_close")
        transport = nil
    }

    private func sendJSON<T: Encodable>(_ value: T, generation gen: UInt64) async throws {
        guard gen == generation, let transport else {
            throw TransportError.notConnected
        }
        let data = try ProtocolJSON.encode(value)
        try await transport.send(data)
    }

    private func startObserversIfNeeded() {
        startPathMonitorIfNeeded()
        startSleepObserversIfNeeded()
    }

    private func startPathMonitorIfNeeded() {
        guard !RuntimeContext.isRunningTests else { return }
        guard pathMonitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { path in
            Task {
                await self.noteNetworkPath(satisfied: path.status == .satisfied)
            }
        }
        monitor.start(queue: pathQueue)
        pathMonitor = monitor
    }

    private func startSleepObserversIfNeeded() {
        guard !RuntimeContext.isRunningTests else { return }
        guard sleepObserver == nil else { return }
        let center = NSWorkspace.shared.notificationCenter
        sleepObserver = center.addObserver(
            forName: NSWorkspace.willSleepNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.noteSystemSleep() }
        }
        wakeObserver = center.addObserver(
            forName: NSWorkspace.didWakeNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            guard let self else { return }
            Task { await self.noteSystemWake() }
        }
    }

    private func stopObservers() {
        pathMonitor?.cancel()
        pathMonitor = nil
        let center = NSWorkspace.shared.notificationCenter
        if let sleepObserver {
            center.removeObserver(sleepObserver)
            self.sleepObserver = nil
        }
        if let wakeObserver {
            center.removeObserver(wakeObserver)
            self.wakeObserver = nil
        }
    }

    private func isTerminated() -> Bool {
        terminated.withLock { $0 }
    }

    private static func userFacingMessage(for error: Error) -> String {
        let urlError = error as? URLError
        switch urlError?.code {
        case .notConnectedToInternet, .networkConnectionLost:
            return "Network unavailable"
        case .cannotFindHost, .dnsLookupFailed:
            return "DNS failure"
        case .serverCertificateUntrusted, .serverCertificateHasBadDate,
             .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot,
             .secureConnectionFailed, .clientCertificateRejected:
            return "TLS failure"
        case .timedOut:
            return "Connection timed out"
        default:
            break
        }
        return "Relay unavailable"
    }
}
