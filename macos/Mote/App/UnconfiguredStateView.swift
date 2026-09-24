import SwiftUI

struct UnconfiguredStateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        MoteSection(title: "Setup", footer: footer) {
            VStack(alignment: .leading, spacing: 0) {
                if !appState.isPairing {
                    MoteRow(label: "Relay URL", interactive: true, hidesLabel: true) {
                        RelayURLField(text: relayURLBinding)
                    }
                }

                if let error = pairingError {
                    if !appState.isPairing {
                        MoteGroupDivider()
                    }
                    MoteInlineErrorView(title: error.title, detail: error.detail)
                }

                if !appState.isPairing || pairingError != nil {
                    MoteGroupDivider()
                }

                actionButton
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: appState.isPairing)
        }
    }

    @ViewBuilder
    private var actionButton: some View {
        if appState.isPairing {
            MoteTextAction(title: "Cancel", usesCancelShortcut: true) {
                appState.cancelPairing()
            }
        } else {
            MoteTrailingAction {
                Button("Pair") {
                    appState.beginPairing()
                }
                .moteButtonStyle(prominent: true)
                .keyboardShortcut(.defaultAction)
                .disabled(!appState.canBeginPairing)
                .accessibilityHint(
                    appState.canBeginPairing
                        ? "Asks Mote Relay to approve this Mac."
                        : "Enter a public Relay URL first."
                )
            }
        }
    }

    private var relayURLBinding: Binding<String> {
        Binding(
            get: { appState.relayURLOverride },
            set: { appState.setRelayURLOverride($0) }
        )
    }

    private var footer: String {
        if appState.isPairing {
            return "Allow this Mac in the Dashboard and it will connect automatically."
        }
        return "Set your public Relay URL, then Pair. The device credential stays in the Keychain."
    }

    private var pairingError: ConnectionStatusCopy.InlineError? {
        ConnectionStatusCopy.inlineError(state: appState.connectionState, lastError: appState.lastError)
    }
}
