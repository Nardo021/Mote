import SwiftUI

struct UnconfiguredStateView: View {
    @Environment(AppState.self) private var appState
    @FocusState private var credentialFocused: Bool

    var body: some View {
        @Bindable var appState = appState

        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text("Mote is not configured")
                .font(MoteTypography.deviceName)
            Text("Register this Device ID on Mote Relay, then paste the device credential. Mote stores it in the Keychain and never shows it again.")
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
                    appState.beginConfiguration()
                } label: {
                    Image(systemName: "doc.on.doc")
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.borderless)
                .help("Copy Device ID")
                .accessibilityLabel("Copy Device ID")
            }

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
            .buttonStyle(.borderedProminent)
            .tint(MoteColors.accent)
            .disabled(!appState.canSaveCredential)
            .padding(.top, MoteSpacing.micro)
            .accessibilityHint("Saves the credential to Keychain and connects to Relay.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: .contain)
        .onAppear {
            credentialFocused = true
        }
        .onChange(of: appState.shouldFocusCredential) { _, shouldFocus in
            guard shouldFocus else { return }
            credentialFocused = true
            appState.shouldFocusCredential = false
        }
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
