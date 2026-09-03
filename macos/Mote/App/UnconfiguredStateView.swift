import SwiftUI

struct UnconfiguredStateView: View {
    @Environment(AppState.self) private var appState
    @FocusState private var credentialFocused: Bool

    var body: some View {
        @Bindable var appState = appState

        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text(title)
                .font(MoteTypography.deviceName)
            Text(subtitle)
                .font(MoteTypography.secondary)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

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

            if let error = pairingError {
                MoteInlineErrorView(title: error.title, detail: error.detail)
            }

            if appState.isPairing {
                Button("Cancel") {
                    appState.cancelPairing()
                }
                .buttonStyle(.bordered)
                .padding(.top, MoteSpacing.micro)
            } else {
                Button("Pair") {
                    appState.beginPairing()
                }
                .buttonStyle(.borderedProminent)
                .tint(MoteColors.accent)
                .padding(.top, MoteSpacing.micro)
                .accessibilityHint("Asks Mote Relay to approve this Mac.")
            }

            DisclosureGroup("Paste credential instead") {
                VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                    SecureField("Device credential", text: $appState.credentialInput)
                        .textFieldStyle(.roundedBorder)
                        .focused($credentialFocused)
                        .accessibilityLabel("Device credential")
                        .onSubmit {
                            Task { await appState.saveDeviceCredential() }
                        }
                    Button("Save and Connect") {
                        Task { await appState.saveDeviceCredential() }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!appState.canSaveCredential)
                    .accessibilityHint("Saves the credential to Keychain and connects to Relay.")
                }
                .padding(.top, MoteSpacing.micro)
            }
            .font(MoteTypography.secondary)
            .padding(.top, MoteSpacing.micro)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: .contain)
        .onChange(of: appState.shouldFocusCredential) { _, shouldFocus in
            guard shouldFocus else { return }
            credentialFocused = true
            appState.shouldFocusCredential = false
        }
    }

    private var title: String {
        appState.isPairing ? "Waiting for approval" : "Mote is not configured"
    }

    private var subtitle: String {
        if appState.isPairing {
            return "Mote Relay can see this Device ID. Allow it in the Dashboard and this Mac will connect automatically."
        }
        return "Click Pair so Mote Relay can approve this Mac. The device credential is stored in the Keychain and never shown again."
    }

    private var pairingError: ConnectionStatusCopy.InlineError? {
        ConnectionStatusCopy.inlineError(state: appState.connectionState, lastError: appState.lastError)
            ?? unconfiguredError
    }

    private var unconfiguredError: ConnectionStatusCopy.InlineError? {
        guard appState.connectionState == .notConfigured else {
            return nil
        }
        guard let lastError = appState.lastError, !lastError.isEmpty else {
            return nil
        }
        if ConnectionStatusCopy.isStartupError(lastError) {
            return nil
        }
        return ConnectionStatusCopy.InlineError(title: lastError, detail: nil)
    }
}

struct DeviceCredentialEditor: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState

        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text("Device Credential")
                .font(MoteTypography.primary)
            Text("Write-only. Stored in Keychain and never shown.")
                .font(MoteTypography.metadata)
                .foregroundStyle(.secondary)
            SecureField("Device credential", text: $appState.credentialInput)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel("Device credential")
                .onSubmit {
                    Task { await appState.saveDeviceCredential() }
                }
            HStack(spacing: MoteSpacing.tight) {
                Button("Save Credential") {
                    Task { await appState.saveDeviceCredential() }
                }
                .buttonStyle(.borderedProminent)
                .tint(MoteColors.accent)
                .disabled(!appState.canSaveCredential)
                Button("Remove Credential", role: .destructive) {
                    Task { await appState.clearDeviceCredential() }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, MoteSpacing.tight)
    }
}
