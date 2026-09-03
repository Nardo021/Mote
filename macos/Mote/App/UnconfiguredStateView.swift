import SwiftUI

struct UnconfiguredStateView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        VStack(alignment: .leading, spacing: MoteSpacing.tight) {
            Text(title)
                .font(MoteTypography.deviceName)
            Text(subtitle)
                .font(MoteTypography.secondary)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, MoteSpacing.tight)
        .accessibilityElement(children: .contain)
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
