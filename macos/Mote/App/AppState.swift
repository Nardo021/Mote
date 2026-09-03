import AppKit
import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    var connectionState: ConnectionState = .notConfigured
    var relayLatency: TimeInterval?
    var deviceName: String = ""
    var startAtLogin: Bool = false
    var lastCommand: MoteCommand?
    var lastCommandResult: MoteCommandResult?
    var lastError: String?
    var lockPermissionGranted = false
    var deviceID: String = ""
    var wantsConnection = true
    var shouldOpenSettings = false
    var credentialInput = ""
    private var pairingTask: Task<Void, Never>?
    private var activePair: PairCreated?

    #if DEBUG
    var debugRelayOverride = ""
    var debugLastMockResult: MoteCommandResult?
    #endif

    let settings: SettingsStore
    let credentials: CredentialManager
    let agent: AgentCoordinator
    let pairing: any PairingServicing
    private let isAccessibilityTrusted: () -> Bool

    init(
        settings: SettingsStore = SettingsStore(),
        credentials: CredentialManager = CredentialManager(),
        executor: any MoteActionExecuting = ActionExecutor(),
        pairing: any PairingServicing = RelayPairingClient(),
        isAccessibilityTrusted: @escaping () -> Bool = { AccessibilityPermission.isTrusted }
    ) {
        self.settings = settings
        self.credentials = credentials
        self.agent = AgentCoordinator(settings: settings, credentials: credentials, executor: executor)
        self.pairing = pairing
        self.isAccessibilityTrusted = isAccessibilityTrusted
        bindAgent()
    }

    var relayConfiguration: RelayConfiguration {
        #if DEBUG
        RelayConfiguration.resolve(settingsOverride: settings.load().relayURLOverride)
        #else
        RelayConfiguration.resolve()
        #endif
    }

    var relayHost: String {
        relayConfiguration.hostDisplayName
    }

    var isUnconfigured: Bool {
        switch connectionState {
        case .notConfigured, .pairing:
            return true
        case .disconnected, .connecting, .authenticating, .connected, .reconnecting, .disabled, .error:
            return false
        }
    }

    var isLiveConnection: Bool {
        switch connectionState {
        case .connecting, .authenticating, .connected, .reconnecting:
            return true
        case .notConfigured, .pairing, .disconnected, .error, .disabled:
            return false
        }
    }

    var needsCredentialPaste: Bool {
        ConnectionStatusCopy.needsCredentialPaste(state: connectionState, lastError: lastError)
    }

    var showsDisconnectAction: Bool {
        wantsConnection && isLiveConnection
    }

    var isPairing: Bool {
        connectionState == .pairing
    }

    var abbreviatedDeviceID: String {
        DeviceIDDisplay.abbreviated(deviceID)
    }

    var latencyText: String {
        guard connectionState == .connected, let relayLatency else {
            return "—"
        }
        return DateHelpers.formatLatency(relayLatency)
    }

    var lockPermissionText: String {
        lockPermissionGranted ? "Granted" : "Required"
    }

    var headerTransportText: String? {
        ConnectionStatusCopy.headerTransportLine(state: connectionState, latencyText: latencyText)
    }

    var menuRelayText: String? {
        ConnectionStatusCopy.menuRelayLine(host: relayHost, latencyText: latencyText, state: connectionState)
    }

    var connectionErrorText: ConnectionStatusCopy.InlineError? {
        ConnectionStatusCopy.inlineError(state: connectionState, lastError: lastError)
    }

    var startupErrorText: String? {
        ConnectionStatusCopy.startupErrorText(lastError)
    }

    var lockAvailabilityText: String {
        lockPermissionGranted ? "Available" : "Unavailable"
    }

    var connectActionTitle: String {
        switch connectionState {
        case .disconnected, .error, .reconnecting, .disabled:
            return "Reconnect"
        case .notConfigured, .pairing, .connecting, .authenticating, .connected:
            return "Connect"
        }
    }

    var persistReconnectingWarning: Bool {
        switch connectionState {
        case .reconnecting:
            return lastError != nil && !ConnectionStatusCopy.isStartupError(lastError)
        case .notConfigured, .pairing, .disconnected, .connecting, .authenticating, .connected, .error, .disabled:
            return false
        }
    }

    func start() {
        let loaded = settings.load()
        deviceID = loaded.deviceID
        deviceName = loaded.deviceName
        wantsConnection = loaded.wantsConnection
        #if DEBUG
        debugRelayOverride = loaded.relayURLOverride ?? ""
        #endif
        refreshPermissionsAndLoginItem()
        agent.refreshDeviceID(deviceID)

        guard !RuntimeContext.isRunningTests else {
            MoteLog.app.info("Test host launch; agent not started")
            return
        }

        MoteLog.app.info("Mote launched")
        Task {
            let configured = await hasStoredCredential()
            if !configured {
                connectionState = .notConfigured
                shouldOpenSettings = true
                return
            }
            if wantsConnection {
                await agent.startIfPossible()
            } else {
                connectionState = .disconnected
            }
        }
    }

    func setDeviceName(_ name: String) {
        settings.saveDeviceName(name)
        deviceName = settings.load().deviceName
    }

    func setStartAtLogin(_ enabled: Bool) {
        do {
            try LoginItemService.setEnabled(enabled)
            startAtLogin = LoginItemService.isEnabled
            lastError = nil
        } catch {
            startAtLogin = LoginItemService.isEnabled
            lastError = "Could not update Start at Login"
            MoteLog.app.error("Start at login change failed")
        }
    }

    func connect() {
        wantsConnection = true
        settings.saveWantsConnection(true)
        Task {
            await agent.connect()
        }
    }

    func disconnect() {
        wantsConnection = false
        settings.saveWantsConnection(false)
        Task {
            await agent.disconnect()
        }
    }

    func quit() {
        Task {
            await agent.shutdown()
            NSApplication.shared.terminate(nil)
        }
    }

    func prepareToShowWindow() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    func presentMainWindow() {
        prepareToShowWindow()
        shouldOpenSettings = true
    }

    func refreshPermissionsAndLoginItem() {
        let trusted = isAccessibilityTrusted()
        if trusted != lockPermissionGranted {
            MoteLog.security.info("Lock permission \(trusted ? "granted" : "required", privacy: .public)")
        }
        lockPermissionGranted = trusted
        startAtLogin = LoginItemService.isEnabled
    }

    func openAccessibilitySettings() {
        AccessibilityPermission.check(prompt: true)
        AccessibilityPermission.openSystemSettings()
    }

    func copyDeviceID() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(deviceID, forType: .string)
    }

    var canSaveCredential: Bool {
        !credentialInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func saveDeviceCredential() async {
        do {
            try await credentials.save(credentialInput)
            credentialInput = ""
            lastError = nil
            wantsConnection = true
            settings.saveWantsConnection(true)
            guard !RuntimeContext.isRunningTests else { return }
            await agent.startIfPossible()
        } catch {
            lastError = "Keychain failure"
        }
    }

    func beginPairing() {
        pairingTask?.cancel()
        pairingTask = Task {
            await runPairing()
        }
    }

    func waitForPairingToFinish() async {
        await pairingTask?.value
    }

    func cancelPairing() {
        pairingTask?.cancel()
        let pair = activePair
        activePair = nil
        connectionState = .notConfigured
        lastError = nil
        guard let pair else { return }
        Task {
            try? await pairing.cancel(
                configuration: relayConfiguration,
                requestID: pair.requestID,
                pairSecret: pair.pairSecret
            )
        }
    }

    func openShortcutSetup() {
        copyDeviceID()
        NSWorkspace.shared.open(relayConfiguration.shortcutSetupURL(deviceID: deviceID))
    }

    private func runPairing() async {
        connectionState = .pairing
        lastError = nil
        do {
            let created = try await pairing.createRequest(
                configuration: relayConfiguration,
                deviceID: deviceID,
                deviceName: deviceName
            )
            try Task.checkCancellation()
            activePair = created
            let decision = try await pairing.waitForDecision(
                configuration: relayConfiguration,
                requestID: created.requestID,
                pairSecret: created.pairSecret
            )
            try Task.checkCancellation()
            switch decision {
            case .approved(_, let credential, _):
                try await credentials.save(credential)
                credentialInput = ""
                lastError = nil
                wantsConnection = true
                settings.saveWantsConnection(true)
                activePair = nil
                guard !RuntimeContext.isRunningTests else {
                    connectionState = .disconnected
                    return
                }
                await agent.startIfPossible()
            case .rejected:
                activePair = nil
                connectionState = .notConfigured
                lastError = "Pairing was denied."
            case .expired:
                activePair = nil
                connectionState = .notConfigured
                lastError = "Pairing expired. Try again."
            }
        } catch is CancellationError {
            return
        } catch {
            if Task.isCancelled {
                return
            }
            activePair = nil
            connectionState = .notConfigured
            if let pairingError = error as? PairingError, case .requestFailed(let message) = pairingError {
                lastError = message
            } else {
                lastError = "Could not start pairing."
            }
        }
    }

    func clearDeviceCredential() async {
        do {
            try await credentials.delete()
            lastError = nil
            wantsConnection = false
            settings.saveWantsConnection(false)
            connectionState = .notConfigured
            guard !RuntimeContext.isRunningTests else { return }
            await agent.disconnect()
        } catch {
            lastError = "Keychain failure"
        }
    }

    func executeLocalLockForDevelopment() async throws {
        let executor = ActionExecutor()
        try await executor.execute(.lock)
    }

    #if DEBUG
    func saveDebugCredential() async {
        await saveDeviceCredential()
    }

    func clearDebugCredential() async {
        await clearDeviceCredential()
    }

    func saveDebugRelayOverride() {
        settings.saveRelayURLOverride(debugRelayOverride)
    }

    func sendMockCommand(
        action: String = MoteAction.lock.rawValue,
        deviceID overrideDeviceID: String? = nil,
        expired: Bool = false,
        duplicate: Bool = false
    ) async -> MoteCommandResult {
        let now = DateHelpers.nowMilliseconds()
        let commandID = duplicate ? (lastCommand?.id ?? "duplicate-test") : UUID().uuidString
        let command = MockCommandFactory.lock(
            deviceID: overrideDeviceID ?? deviceID,
            id: commandID,
            createdAt: expired ? now - 30_000 : now,
            expiresAt: expired ? now - 20_000 : now + ProtocolConstants.commandTTLMilliseconds,
            action: action
        )
        let result = await agent.processMockCommand(command)
        debugLastMockResult = result
        lastCommand = command
        lastCommandResult = result
        return result
    }
    #endif

    private func bindAgent() {
        agent.onState = { [weak self] state in
            self?.connectionState = state
        }
        agent.onLatency = { [weak self] latency in
            self?.relayLatency = latency
        }
        agent.onError = { [weak self] message in
            self?.lastError = message
        }
        agent.onCommand = { [weak self] command in
            self?.lastCommand = command
        }
        agent.onCommandResult = { [weak self] result in
            self?.lastCommandResult = result
        }
    }

    private func hasStoredCredential() async -> Bool {
        do {
            if let stored = try await credentials.load(), !stored.isEmpty {
                return true
            }
        } catch {
            lastError = "Keychain failure"
            return false
        }
        #if DEBUG
        if await credentials.debugFallbackFromEnvironment() != nil {
            return true
        }
        #endif
        return false
    }
}
