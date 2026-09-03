import SwiftUI

#if DEBUG
struct DeveloperSettingsView: View {
    @Environment(AppState.self) private var appState
    @FocusState private var credentialFieldFocused: Bool
    @State private var isExpanded = false
    @State private var isLocking = false
    @State private var localLockMessage: String?

    var body: some View {
        @Bindable var appState = appState

        MoteSection(title: "Advanced") {
            DisclosureGroup(isExpanded: $isExpanded) {
                AdvancedDebugContent(
                    appState: appState,
                    credentialFieldFocused: $credentialFieldFocused,
                    isLocking: $isLocking,
                    localLockMessage: $localLockMessage
                )
                .padding(.top, MoteSpacing.tight)
            } label: {
                Text("DEBUG")
                    .font(MoteTypography.primary)
                    .foregroundStyle(.secondary)
            }
        }
        .onChange(of: appState.shouldFocusCredential) { _, shouldFocus in
            guard shouldFocus else { return }
            isExpanded = true
            credentialFieldFocused = true
            appState.shouldFocusCredential = false
        }
    }
}

private struct AdvancedDebugContent: View {
    @Bindable var appState: AppState
    var credentialFieldFocused: FocusState<Bool>.Binding
    @Binding var isLocking: Bool
    @Binding var localLockMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MoteRow(label: "Relay Endpoint", alignment: .firstTextBaseline) {
                MoteValueText(
                    text: appState.relayConfiguration.webSocketURL.absoluteString,
                    monospaced: true
                )
            }
            Divider()
            VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                Text("Relay URL override")
                    .font(MoteTypography.primary)
                TextField("Relay URL override", text: $appState.debugRelayOverride)
                    .textFieldStyle(.roundedBorder)
                    .font(MoteTypography.technical)
                    .onSubmit {
                        appState.saveDebugRelayOverride()
                    }
            }
            .padding(.vertical, MoteSpacing.tight)

            Divider()
            VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                Text("Development Credential")
                    .font(MoteTypography.primary)
                Text("Stored in Keychain and never logged.")
                    .font(MoteTypography.metadata)
                    .foregroundStyle(.secondary)
                SecureField("Device credential", text: $appState.credentialInput)
                    .textFieldStyle(.roundedBorder)
                    .focused(credentialFieldFocused)
                    .accessibilityLabel("Development device credential")
                HStack(spacing: MoteSpacing.tight) {
                    Button("Save Credential") {
                        Task { await appState.saveDeviceCredential() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(MoteColors.accent)
                    .disabled(!appState.canSaveCredential)
                    Button("Clear Credential", role: .destructive) {
                        Task { await appState.clearDeviceCredential() }
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(.vertical, MoteSpacing.tight)

            Divider()
            MoteRow(label: "Device ID", alignment: .firstTextBaseline) {
                MoteValueText(text: appState.deviceID, monospaced: true)
            }
            Divider()
            MoteRow(label: "Connection State") {
                MoteValueText(text: appState.connectionState.debugLabel, monospaced: true)
            }
            Divider()
            MoteRow(label: "Protocol Version") {
                MoteValueText(text: "Mote Protocol v\(ProtocolConstants.version)", monospaced: true)
            }
            Divider()
            MoteRow(label: "App Version") {
                MoteValueText(text: AppVersion.display, monospaced: true)
            }
            Divider()
            MoteRow(label: "Last Command ID") {
                MoteValueText(text: lastCommandText, monospaced: true)
            }
            Divider()
            MoteRow(label: "Last Result") {
                MoteValueText(text: appState.lastCommandResult?.status.rawValue ?? "—", monospaced: true)
            }

            HStack(spacing: MoteSpacing.tight) {
                Button("Connect") { appState.connect() }
                    .buttonStyle(.borderedProminent)
                    .tint(MoteColors.accent)
                Button("Disconnect") { appState.disconnect() }
                    .buttonStyle(.bordered)
            }
            .padding(.vertical, MoteSpacing.tight)

            VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                Button("Send Expired Mock Command") {
                    Task { _ = await appState.sendMockCommand(expired: true) }
                }
                Button("Send Wrong-Device Mock Command") {
                    Task { _ = await appState.sendMockCommand(deviceID: "other-device") }
                }
                Button("Send Unknown-Action Mock Command") {
                    Task { _ = await appState.sendMockCommand(action: "not_an_action") }
                }
                Button("Send Valid Mock Lock Command") {
                    Task { _ = await appState.sendMockCommand() }
                }
                Text("Valid mock lock and Test Lock will immediately lock this Mac.")
                    .font(MoteTypography.secondary)
                    .foregroundStyle(.secondary)
                Button("Test Lock") {
                    Task { await testLock() }
                }
                .disabled(isLocking)
                if let localLockMessage {
                    Text(localLockMessage)
                        .font(MoteTypography.secondary)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.top, MoteSpacing.tight)

            Text("DEBUG only. Credentials stay in Keychain and are never shown in the normal interface.")
                .font(MoteTypography.metadata)
                .foregroundStyle(.tertiary)
                .padding(.top, MoteSpacing.tight)
        }
    }

    private var lastCommandText: String {
        guard let command = appState.lastCommand else {
            return "—"
        }
        return command.id
    }

    private func testLock() async {
        isLocking = true
        defer { isLocking = false }
        do {
            try await appState.executeLocalLockForDevelopment()
            localLockMessage = "Local lock action posted"
        } catch ActionExecutionError.permissionRequired {
            localLockMessage = "Lock permission required"
            appState.refreshPermissionsAndLoginItem()
        } catch {
            localLockMessage = "Local lock failed"
        }
    }
}
#endif
