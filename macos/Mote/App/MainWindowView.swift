import SwiftUI

struct MainWindowView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: MoteSpacing.section) {
                    header
                        .id("mote-top")

                    if appState.isUnconfigured {
                        UnconfiguredStateView()
                    } else {
                        connectionSection
                        remoteActionsSection
                    }

                    permissionsSection
                    startupSection
                    deviceSection
                    if !appState.isUnconfigured {
                        shortcutsSection
                    }

                    #if DEBUG
                    DeveloperSettingsView()
                    #endif
                }
                .padding(MoteSpacing.section)
                .frame(maxWidth: MoteSpacing.windowMaxContentWidth, alignment: .leading)
                .frame(maxWidth: .infinity)
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
        .accessibilityLabel("Mote")
    }

    @ViewBuilder
    private var header: some View {
        if appState.isUnconfigured {
            Text(appState.deviceName)
                .font(MoteTypography.deviceName)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .accessibilityLabel(appState.deviceName)
        } else {
            WindowHeaderView(
                deviceName: appState.deviceName,
                state: appState.connectionState,
                persistWarning: appState.persistReconnectingWarning,
                transportText: appState.headerTransportText
            )
        }
    }

    private var connectionSection: some View {
        MoteSection(title: "Connection") {
            MoteRow(label: "Relay") {
                MoteValueText(text: appState.relayHost, monospaced: true)
            }
            Divider()
            MoteRow(label: "Latency") {
                MoteValueText(text: appState.latencyText, monospaced: true)
            }
            if let error = appState.connectionErrorText {
                Divider()
                MoteInlineErrorView(title: error.title, detail: error.detail)
            }
            connectionAction
                .padding(.top, MoteSpacing.micro)
        }
    }

    @ViewBuilder
    private var connectionAction: some View {
        if appState.wantsConnection {
            Button("Disconnect") {
                appState.disconnect()
            }
            .buttonStyle(.bordered)
        } else {
            Button("Connect") {
                appState.connect()
            }
            .buttonStyle(.borderedProminent)
            .tint(MoteColors.accent)
            .keyboardShortcut(.defaultAction)
        }
    }

    private var remoteActionsSection: some View {
        MoteSection(title: "Remote Actions") {
            MoteRow(label: "Lock") {
                MoteValueText(text: appState.lockActionText)
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
                Divider()
                VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                    Text("Mote needs Accessibility permission to lock this Mac remotely.")
                        .font(MoteTypography.secondary)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Open System Settings") {
                        appState.openAccessibilitySettings()
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.vertical, MoteSpacing.tight)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var startupSection: some View {
        MoteSection(title: "Startup") {
            MoteRow(label: "Start Mote at Login") {
                Toggle("Start Mote at Login", isOn: startAtLoginBinding)
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)
            }

            if let startupErrorText = appState.startupErrorText {
                MoteInlineErrorView(title: startupErrorText)
            }
        }
    }

    private var deviceSection: some View {
        MoteSection(title: "Device") {
            MoteRow(label: "Name") {
                TextField("Device name", text: deviceNameBinding)
                    .textFieldStyle(.roundedBorder)
                    .font(MoteTypography.primary)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 180)
                    .accessibilityLabel("Device name")
            }
            Divider()
            MoteRow(label: "Device ID") {
                HStack(spacing: MoteSpacing.tight) {
                    Text(appState.abbreviatedDeviceID)
                        .font(MoteTypography.technical)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .help(appState.deviceID)
                    Button {
                        appState.copyDeviceID()
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.borderless)
                    .help("Copy Device ID")
                    .accessibilityLabel("Copy Device ID")
                }
            }
            Divider()
            MoteRow(label: "Version") {
                MoteValueText(text: AppVersion.display, monospaced: true)
            }
            if !appState.isUnconfigured {
                Divider()
                DeviceCredentialEditor()
            }
        }
    }

    private var shortcutsSection: some View {
        @Bindable var appState = appState
        return MoteSection(title: "Shortcuts") {
            MoteRow(label: "Device ID") {
                HStack(spacing: MoteSpacing.tight) {
                    Text(appState.deviceID)
                        .font(MoteTypography.technical)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .lineLimit(1)
                    Button {
                        appState.copyDeviceID()
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.borderless)
                    .help("Copy Device ID")
                    .accessibilityLabel("Copy Device ID")
                }
            }
            Divider()
            MoteRow(label: "Shortcut token", alignment: .top) {
                VStack(alignment: .trailing, spacing: MoteSpacing.micro) {
                    SecureField("Shortcut token", text: $appState.shortcutTokenInput)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 180)
                        .accessibilityLabel("Shortcut token")
                        .accessibilityHint("Not saved by Mote. Paste it into Shortcuts yourself.")
                    Button("Copy Bearer header") {
                        appState.copyShortcutBearerHeader()
                    }
                    .buttonStyle(.bordered)
                    .disabled(!appState.canCopyShortcutBearer)
                    .controlSize(.small)
                }
            }
            Divider()
            VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                Text("Mote does not store or send this token. Create it in the Relay Tokens page, then paste it into Shortcuts.")
                    .font(MoteTypography.secondary)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Add to Shortcuts") {
                    appState.openShortcutSetup()
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Copies the Device ID and opens the shortcut setup page.")
            }
            .padding(.vertical, MoteSpacing.tight)
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

#Preview("Permission Required") {
    MainWindowView()
        .environment(previewAppState(.connected, permission: false, latency: 0.018))
}

#Preview("Dark") {
    MainWindowView()
        .environment(previewAppState(.connected, permission: true, latency: 0.004))
        .preferredColorScheme(.dark)
}

@MainActor
private func previewAppState(
    _ connection: ConnectionState,
    permission: Bool,
    latency: TimeInterval? = nil
) -> AppState {
    let state = AppState()
    state.deviceName = "MacBook Pro"
    state.deviceID = "7B0F0000-0000-0000-0000-0000000091AC"
    state.connectionState = connection
    state.lockPermissionGranted = permission
    state.relayLatency = latency
    state.startAtLogin = true
    if case .error = connection {
        state.lastError = "Relay unavailable"
    }
    return state
}
#endif
