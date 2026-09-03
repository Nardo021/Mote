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
    var shouldFocusCredential = false

    #if DEBUG
    var debugRelayOverride = ""
    var debugLastMockResult: MoteCommandResult?
    #endif

    let settings: SettingsStore
    let credentials: CredentialManager
    let agent: AgentCoordinator

    init(
        settings: SettingsStore = SettingsStore(),
        credentials: CredentialManager = CredentialManager(),
        executor: any MoteActionExecuting = ActionExecutor()
    ) {
        self.settings = settings
        self.credentials = credentials
        self.agent = AgentCoordinator(settings: settings, credentials: credentials, executor: executor)
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
        connectionState == .notConfigured
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

    var lockActionText: String {
        ConnectionStatusCopy.lockActionStatus(permissionGranted: lockPermissionGranted)
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
        ConnectionStatusCopy.isStartupError(lastError) ? lastError : nil
    }

    var persistReconnectingWarning: Bool {
        switch connectionState {
        case .reconnecting:
            return lastError != nil && !ConnectionStatusCopy.isStartupError(lastError)
        case .notConfigured, .disconnected, .connecting, .authenticating, .connected, .error:
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
        lockPermissionGranted = AccessibilityPermission.isTrusted
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

    func beginConfiguration() {
        copyDeviceID()
        shouldFocusCredential = true
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
            await agent.connect()
        } catch {
            lastError = "Keychain failure"
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
