import SwiftUI

struct UnconfiguredStateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        MoteGroupSurface {
            VStack(alignment: .leading, spacing: MoteSpacing.related) {
                VStack(alignment: .leading, spacing: MoteSpacing.tight) {
                    Text(title)
                        .font(MoteTypography.primaryMedium)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(subtitle)
                        .font(MoteTypography.secondary)
                        .foregroundStyle(.secondary)
                        .lineSpacing(MoteTypography.wrappingLineSpacing)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                .id(subtitle)

                if let error = pairingError {
                    MoteInlineErrorView(title: error.title, detail: error.detail)
                }

                actionButton
            }
            .padding(.vertical, MoteSpacing.tight)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: subtitle)
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var actionButton: some View {
        if appState.isPairing {
            Button("Cancel") {
                appState.cancelPairing()
            }
            .moteButtonStyle()
            .keyboardShortcut(.cancelAction)
        } else {
            Button("Pair") {
                appState.beginPairing()
            }
            .moteButtonStyle(prominent: true)
            .keyboardShortcut(.defaultAction)
            .accessibilityHint("Asks Mote Relay to approve this Mac.")
        }
    }

    private var title: String {
        appState.isPairing ? "Waiting for approval" : "Mote is not configured"
    }

    private var subtitle: String {
        if appState.isPairing {
            return "Relay can see this Device ID. Allow this Mac in the Dashboard and it will connect automatically."
        }
        return "Pair this Mac so Relay can approve it. The device credential stays in the Keychain and is never shown again."
    }

    private var pairingError: ConnectionStatusCopy.InlineError? {
        ConnectionStatusCopy.inlineError(state: appState.connectionState, lastError: appState.lastError)
    }
}
