import Foundation

@MainActor
final class AgentCoordinator {
    private let settings: SettingsStore
    private let credentials: CredentialManager
    private let executor: any MoteActionExecuting
    private var processor: CommandProcessor
    private var client: RelayClient?
    private var deviceID: String

    var onState: ((ConnectionState) -> Void)?
    var onLatency: ((TimeInterval?) -> Void)?
    var onError: ((String?) -> Void)?
    var onCommand: ((MoteCommand) -> Void)?
    var onCommandResult: ((MoteCommandResult) -> Void)?

    init(
        settings: SettingsStore,
        credentials: CredentialManager,
        executor: any MoteActionExecuting = ActionExecutor()
    ) {
        self.settings = settings
        self.credentials = credentials
        self.executor = executor
        let loaded = settings.load()
        self.deviceID = loaded.deviceID
        self.processor = CommandProcessor(deviceID: loaded.deviceID, executor: executor)
    }

    func startIfPossible() async {
        let settings = settings.load()
        deviceID = settings.deviceID
        processor = CommandProcessor(deviceID: settings.deviceID, executor: executor)

        guard settings.wantsConnection else {
            onState?(.disconnected)
            return
        }

        let configured = await hasCredential()
        if !configured {
            onState?(.notConfigured)
            return
        }

        await ensureClient().start()
    }

    func connect() async {
        settings.saveWantsConnection(true)
        let configured = await hasCredential()
        if !configured {
            onState?(.notConfigured)
            return
        }
        await ensureClient().requestConnect()
    }

    func disconnect() async {
        settings.saveWantsConnection(false)
        await client?.stop(intentional: true)
        onState?(.disconnected)
    }

    func shutdown() async {
        await client?.stop(intentional: true)
        MoteLog.agent.info("Agent shutdown")
    }

    func processMockCommand(_ command: MoteCommand) async -> MoteCommandResult {
        onCommand?(command)
        let result = await processor.process(command)
        onCommandResult?(result)
        return result
    }

    func refreshDeviceID(_ deviceID: String) {
        self.deviceID = deviceID
        processor = CommandProcessor(deviceID: deviceID, executor: executor)
        client = nil
    }

    private func hasCredential() async -> Bool {
        do {
            if let stored = try await credentials.load(), !stored.isEmpty {
                return true
            }
        } catch {
            onError?("Keychain failure")
            MoteLog.security.error("Credential read failed")
            return false
        }

        #if DEBUG
        if await credentials.debugFallbackFromEnvironment() != nil {
            return true
        }
        #endif

        return false
    }

    private func ensureClient() -> RelayClient {
        if let client {
            return client
        }

        let events = RelayClientEvents(
            onState: { [weak self] state in
                Task { @MainActor in
                    self?.onState?(state)
                }
            },
            onLatency: { [weak self] latency in
                Task { @MainActor in
                    self?.onLatency?(latency)
                }
            },
            onError: { [weak self] message in
                Task { @MainActor in
                    self?.onError?(message)
                }
            },
            onCommand: { [weak self] command in
                await self?.handleCommand(command) ?? .status(.failed, commandID: command.id, error: "agent_unavailable")
            }
        )

        let created = RelayClient(
            deviceID: deviceID,
            configurationProvider: { [settings] in
                RelayConfiguration.resolve(settingsOverride: settings.load().relayURLOverride)
            },
            credentialProvider: { [credentials] in
                if let stored = try await credentials.load(), !stored.isEmpty {
                    return stored
                }
                #if DEBUG
                return await credentials.debugFallbackFromEnvironment()
                #else
                return nil
                #endif
            },
            events: events
        )
        client = created
        return created
    }

    private func handleCommand(_ command: MoteCommand) async -> MoteCommandResult {
        await MainActor.run {
            onCommand?(command)
        }
        let result = await processor.process(command)
        await MainActor.run {
            onCommandResult?(result)
        }
        return result
    }
}
