import Foundation
import Network

struct RelayClientEvents: Sendable {
    var onState: @Sendable (ConnectionState) -> Void
    var onLatency: @Sendable (TimeInterval?) -> Void
    var onError: @Sendable (String?) -> Void
    var onCommand: @Sendable (MoteCommand) async -> MoteCommandResult
}

actor RelayClient {
    private let deviceID: String
    private let configurationProvider: @Sendable () -> RelayConfiguration
    private let credentialProvider: @Sendable () async throws -> String?
    private let transportFactory: @Sendable (URL) -> any MessageTransport
    private let events: RelayClientEvents

    private var transport: (any MessageTransport)?
    private var generation: UInt64 = 0
    private var receiveTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var authTimeoutTask: Task<Void, Never>?
    private var stableResetTask: Task<Void, Never>?
    private var pathMonitor: NWPathMonitor?
    private var pathQueue = DispatchQueue(label: "me.yanze.mote.path")

    private var intentionalDisconnect = false
    private var isAuthenticated = false
    private var reconnectAttempt = 0
    private var policy = ReconnectPolicy()
    private var lastError: String?

    init(
        deviceID: String,
        configurationProvider: @escaping @Sendable () -> RelayConfiguration,
        credentialProvider: @escaping @Sendable () async throws -> String?,
        transportFactory: @escaping @Sendable (URL) -> any MessageTransport = { WebSocketTransport(url: $0) },
        events: RelayClientEvents
    ) {
        self.deviceID = deviceID
        self.configurationProvider = configurationProvider
        self.credentialProvider = credentialProvider
        self.transportFactory = transportFactory
        self.events = events
    }

    func start() async {
        intentionalDisconnect = false
        startPathMonitorIfNeeded()
        await connect(isReconnect: false, resetBackoff: true)
    }

    func stop(intentional: Bool) async {
        intentionalDisconnect = intentional
        generation += 1
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
        intentionalDisconnect = false
        await connect(isReconnect: false, resetBackoff: true)
    }

    private func connect(isReconnect: Bool, resetBackoff: Bool) async {
        if resetBackoff {
            reconnectAttempt = 0
        }

        guard !intentionalDisconnect else {
            events.onState(.disconnected)
            return
        }

        let credential: String?
        do {
            credential = try await credentialProvider()
        } catch {
            lastError = "Keychain failure"
            events.onError(lastError)
            events.onState(.error("Keychain failure"))
            MoteLog.security.error("Failed to read device credential")
            return
        }

        guard let credential, !credential.isEmpty else {
            events.onState(.notConfigured)
            return
        }

        generation += 1
        let gen = generation
        await tearDownSocket()
        isAuthenticated = false
        events.onLatency(nil)
        events.onState(isReconnect ? .reconnecting : .connecting)
        MoteLog.network.info("Connection attempt")

        let configuration = configurationProvider()
        let nextTransport = transportFactory(configuration.webSocketURL)
        transport = nextTransport

        do {
            try await nextTransport.connect()
            guard gen == generation else { return }
            events.onState(.authenticating)
            try await sendJSON(
                AuthMessage(deviceID: deviceID, credential: credential, appVersion: AppVersion.display),
                generation: gen
            )
            startReceiveLoop(generation: gen)
            startAuthTimeout(generation: gen)
        } catch {
            if gen != generation || intentionalDisconnect {
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
                if Task.isCancelled || gen != generation || intentionalDisconnect {
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
            let message = result.error ?? "invalid_credentials"
            lastError = message
            events.onError(message)
            events.onState(.error(message))
            intentionalDisconnect = true
            generation += 1
            await tearDownSocket()
            MoteLog.network.error("Authentication failed")
            return
        }

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
        let manager = HeartbeatManager()
        heartbeatTask = Task {
            await manager.run { [weak self] in
                try await self?.sendHeartbeat(generation: gen)
            }
        }
    }

    private func sendHeartbeat(generation gen: UInt64) async throws {
        guard gen == generation, isAuthenticated else { return }
        let message = HeartbeatMessage(deviceID: deviceID, sentAt: DateHelpers.nowMilliseconds())
        try await sendJSON(message, generation: gen)
    }

    private func startAuthTimeout(generation gen: UInt64) {
        authTimeoutTask?.cancel()
        authTimeoutTask = Task {
            try? await Task.sleep(for: .seconds(ProtocolConstants.authTimeoutSeconds))
            await self.authTimedOut(generation: gen)
        }
    }

    private func authTimedOut(generation gen: UInt64) async {
        guard gen == generation, !isAuthenticated, !intentionalDisconnect else { return }
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

    private func handleUnexpectedDisconnect(generation gen: UInt64) async {
        guard gen == generation else { return }
        generation += 1
        isAuthenticated = false
        events.onLatency(nil)
        await tearDownSocket()
        await scheduleReconnect()
    }

    private func scheduleReconnect() async {
        guard !intentionalDisconnect else { return }
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
        await connect(isReconnect: true, resetBackoff: false)
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

    private func startPathMonitorIfNeeded() {
        guard pathMonitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { path in
            Task {
                await self.pathChanged(path)
            }
        }
        monitor.start(queue: pathQueue)
        pathMonitor = monitor
    }

    private func pathChanged(_ path: NWPath) {
        guard path.status == .satisfied else { return }
        guard !intentionalDisconnect, !isAuthenticated else { return }
        reconnectTask?.cancel()
        reconnectAttempt = 0
        Task {
            await self.connect(isReconnect: true, resetBackoff: true)
        }
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
