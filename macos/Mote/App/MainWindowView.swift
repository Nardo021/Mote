import SwiftUI

struct MainWindowView: View {
    @Environment(AppState.self) private var appState
    @AccessibilityFocusState private var headerIsFocused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: MoteSpacing.major) {
                    header
                        .id("mote-top")
                        .accessibilityFocused($headerIsFocused)

                    if appState.isUnconfigured {
                        UnconfiguredStateView()
                        deviceSection
                        permissionsSection
                        startupSection
                        shortcutsSection
                    } else {
                        connectionSection
                        if appState.lockPermissionGranted {
                            remoteActionsSection
                            permissionsSection
                        } else {
                            permissionsSection
                            remoteActionsSection
                        }
                        startupSection
                        deviceSection
                        shortcutsSection
                    }

                    #if DEBUG
                    DeveloperSettingsView()
                    #endif
                }
                .padding(.horizontal, MoteSpacing.section)
                .padding(.top, MoteSpacing.section)
                .padding(.bottom, MoteSpacing.major)
                .frame(maxWidth: MoteSpacing.windowMaxContentWidth, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .center)
            }
            .onAppear {
                proxy.scrollTo("mote-top", anchor: .top)
            }
        }
        .background(MoteColors.canvas)
        .frame(
            minWidth: MoteSpacing.windowMinWidth,
            idealWidth: MoteSpacing.windowIdealWidth,
            minHeight: MoteSpacing.windowMinHeight,
            idealHeight: MoteSpacing.windowIdealHeight
        )
        .onAppear {
            guard !RuntimeContext.isRunningTests else { return }
            appState.refreshPermissionsAndLoginItem()
        }
        .onChange(of: appState.connectionState.title) { oldTitle, newTitle in
            guard oldTitle != newTitle else { return }
            AccessibilityNotification.Announcement(newTitle).post()
        }
        .onChange(of: announcementSignature(for: appState.connectionErrorText)) { _, newValue in
            guard let newValue else { return }
            AccessibilityNotification.Announcement(newValue).post()
        }
        .onChange(of: appState.startupErrorText) { _, newValue in
            guard let newValue else { return }
            AccessibilityNotification.Announcement(newValue).post()
        }
        .onChange(of: appState.isPairing) { wasPairing, isPairing in
            if wasPairing && !isPairing {
                headerIsFocused = true
            }
        }
    }

    private var header: some View {
        WindowHeaderView(
            deviceName: appState.deviceName,
            state: appState.connectionState,
            persistWarning: appState.persistReconnectingWarning,
            transportText: appState.headerTransportText
        )
    }

    private var connectionSection: some View {
        MoteSection(title: "Connection") {
            MoteRow(label: "Relay") {
                MoteValueText(text: appState.relayHost, monospaced: true)
            }
            MoteGroupDivider()
            MoteRow(label: "Latency") {
                MoteValueText(text: appState.latencyText, monospacedDigit: true)
            }
            if let error = appState.connectionErrorText {
                MoteGroupDivider()
                MoteInlineErrorView(title: error.title, detail: error.detail)
            }
            if appState.needsCredentialPaste {
                MoteGroupDivider()
                CredentialRecoveryView(appState: appState)
            }
            MoteGroupDivider()
            connectionAction
        }
    }

    @ViewBuilder
    private var connectionAction: some View {
        if appState.showsDisconnectAction {
            MoteTextAction(title: "Disconnect") {
                appState.disconnect()
            }
        } else {
            Button(appState.connectActionTitle) {
                appState.connect()
            }
            .moteButtonStyle(prominent: true)
            .keyboardShortcut(.defaultAction)
            .padding(.vertical, MoteSpacing.tight)
        }
    }

    private var remoteActionsSection: some View {
        MoteSection(title: "Remote Actions") {
            MoteRow(label: "Lock") {
                MoteValueText(
                    text: appState.lockAvailabilityText,
                    color: appState.lockPermissionGranted ? MoteColors.success : MoteColors.warning
                )
            }
        }
    }

    private var permissionsSection: some View {
        MoteSection(title: "Permissions") {
            MoteRow(label: "Lock Permission") {
                MoteValueText(
                    text: appState.lockPermissionText,
                    color: appState.lockPermissionGranted ? MoteColors.success : MoteColors.warning
                )
            }

            if !appState.lockPermissionGranted {
                MoteGroupDivider()
                MoteHelperBlock(text: "Mote needs Accessibility permission to lock this Mac remotely.") {
                    MoteTextAction(title: "Open System Settings", hint: "Opens System Settings") {
                        appState.openAccessibilitySettings()
                    }
                }
            }
        }
    }

    private var startupSection: some View {
        MoteSection(title: "Startup") {
            MoteRow(label: "Start Mote at Login", alignment: .center, interactive: true, hidesLabel: true) {
                Toggle("Start Mote at Login", isOn: startAtLoginBinding)
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)
            }

            if let startupErrorText = appState.startupErrorText {
                MoteGroupDivider()
                MoteInlineErrorView(title: startupErrorText)
            }
        }
    }

    private var deviceSection: some View {
        MoteSection(title: "Device") {
            MoteRow(label: "Name", interactive: true, hidesLabel: true) {
                DeviceNameField(text: deviceNameBinding)
            }
            MoteGroupDivider()
            MoteRow(label: "Device ID", alignment: .center) {
                HStack(spacing: MoteSpacing.related) {
                    Text(appState.abbreviatedDeviceID)
                        .font(MoteTypography.technical)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .textSelection(.enabled)
                        .help(appState.deviceID)
                    CopyDeviceIDButton {
                        appState.copyDeviceID()
                    }
                }
            }
            MoteGroupDivider()
            MoteRow(label: "Version") {
                MoteValueText(text: AppVersion.display, monospaced: true)
            }
        }
    }

    private var shortcutsSection: some View {
        MoteSection(title: "Shortcuts") {
            MoteHelperBlock(text: "Opens the setup page with this Device ID.") {
                MoteTextAction(
                    title: "Open Shortcut Setup",
                    hint: "Copies the Device ID and opens the shortcut setup page."
                ) {
                    appState.openShortcutSetup()
                }
            }
        }
    }

    private var deviceNameBinding: Binding<String> {
        Binding(
            get: { appState.deviceName },
            set: { appState.setDeviceName($0) }
        )
    }

    private var startAtLoginBinding: Binding<Bool> {
        Binding(
            get: { appState.startAtLogin },
            set: { appState.setStartAtLogin($0) }
        )
    }

    private func announcementSignature(for error: ConnectionStatusCopy.InlineError?) -> String? {
        guard let error else {
            return nil
        }
        if let detail = error.detail, !detail.isEmpty {
            return "\(error.title) \(detail)"
        }
        return error.title
    }
}

#if DEBUG
#Preview("Connected") {
    MainWindowView()
        .environment(previewAppState(.connected, permission: true, latency: 0.004))
}

#Preview("Disconnected") {
    MainWindowView()
        .environment(previewAppState(.disconnected, permission: true))
}

#Preview("Unconfigured") {
    MainWindowView()
        .environment(previewAppState(.notConfigured, permission: false))
}

#Preview("Pairing") {
    MainWindowView()
        .environment(previewAppState(.pairing, permission: false))
}

#Preview("Permission Required") {
    MainWindowView()
        .environment(previewAppState(.connected, permission: false, latency: 0.018))
}

#Preview("Disabled") {
    MainWindowView()
        .environment(previewAppState(.disabled, permission: true, lastError: RelayCloseReason.deviceDisabled.rawValue))
}

#Preview("Credential Rotated") {
    MainWindowView()
        .environment(
            previewAppState(
                .error(RelayCloseReason.credentialRotated.rawValue),
                permission: true,
                lastError: RelayCloseReason.credentialRotated.rawValue
            )
        )
}

#Preview("Dark") {
    MainWindowView()
        .environment(previewAppState(.connected, permission: true, latency: 0.004))
        .preferredColorScheme(.dark)
}

#Preview("Narrow 460×480") {
    MainWindowView()
        .environment(previewAppState(.connected, permission: true, latency: 0.124))
        .frame(width: 460, height: 480)
}

#Preview("Extra Wide") {
    MainWindowView()
        .environment(previewAppState(.disconnected, permission: true))
        .frame(width: 900, height: 640)
}

@MainActor
private func previewAppState(
    _ connection: ConnectionState,
    permission: Bool,
    latency: TimeInterval? = nil,
    lastError: String? = nil
) -> AppState {
    let state = AppState()
    state.deviceName = "MacBook Pro"
    state.deviceID = "7B0F0000-0000-0000-0000-0000000091AC"
    state.connectionState = connection
    state.lockPermissionGranted = permission
    state.relayLatency = latency
    state.startAtLogin = true
    if let lastError {
        state.lastError = lastError
    } else if case .error = connection {
        state.lastError = "Relay unavailable"
    } else if case .disabled = connection {
        state.lastError = RelayCloseReason.deviceDisabled.rawValue
    }
    return state
}
#endif
