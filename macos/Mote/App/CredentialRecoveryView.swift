import SwiftUI

struct CredentialRecoveryView: View {
    @Bindable var appState: AppState
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup("Paste credential", isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                SecureField("Device credential", text: $appState.credentialInput)
                    .textFieldStyle(.roundedBorder)
                    .font(MoteTypography.technical)
                    .accessibilityLabel("Device credential")
                Button("Save Credential") {
                    Task {
                        await appState.saveDeviceCredential()
                        if appState.lastError == nil {
                            AccessibilityNotification.Announcement("Credential saved").post()
                        }
                    }
                }
                .moteButtonStyle(prominent: true)
                .disabled(!appState.canSaveCredential)
            }
            .padding(.top, MoteSpacing.tight)
        }
        .font(MoteTypography.primary)
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: .contain)
    }
}
