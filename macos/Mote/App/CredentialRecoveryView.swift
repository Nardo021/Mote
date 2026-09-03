import SwiftUI

struct CredentialRecoveryView: View {
    @Bindable var appState: AppState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                toggleExpanded()
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: MoteSpacing.related) {
                    Text("Paste credential")
                        .font(MoteTypography.primary)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: MoteSpacing.related)
                    Image(systemName: "chevron.forward")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, MoteSpacing.tight)
            .accessibilityLabel("Paste credential")
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint("Shows a field to paste a new device credential")

            if isExpanded {
                VStack(alignment: .leading, spacing: MoteSpacing.related) {
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
                .padding(.bottom, MoteSpacing.tight)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func toggleExpanded() {
        if reduceMotion {
            isExpanded.toggle()
        } else {
            withAnimation(.easeOut(duration: 0.2)) {
                isExpanded.toggle()
            }
        }
    }
}
