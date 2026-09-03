import SwiftUI

struct MenuBarView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        Text("Mote")
            .onAppear {
                openSettingsIfNeeded()
            }
            .onChange(of: appState.shouldOpenSettings) { _, _ in
                openSettingsIfNeeded()
            }

        if appState.isUnconfigured {
            Text("Mote is not configured")
            Text(appState.deviceName)
        } else {
            Text(appState.connectionState.menuTitle)
            Text(appState.deviceName)

            if let relayLine = appState.menuRelayText {
                Text("Relay")
                Text(relayLine)
            }
        }

        Text("Lock Permission")
        Text(appState.lockPermissionText)
        Toggle("Start at Login", isOn: startAtLoginBinding)

        Divider()
        Button("Open Mote") {
            appState.prepareToShowWindow()
            openWindow(id: "main")
        }
        connectionButton

        Divider()
        Button("Quit Mote") {
            appState.quit()
        }
    }

    @ViewBuilder
    private var connectionButton: some View {
        if appState.isUnconfigured {
            EmptyView()
        } else if appState.wantsConnection {
            Button("Disconnect") {
                appState.disconnect()
            }
        } else {
            Button(reconnectTitle) {
                appState.connect()
            }
        }
    }

    private var reconnectTitle: String {
        switch appState.connectionState {
        case .disconnected, .error, .reconnecting:
            return "Reconnect"
        case .notConfigured, .connecting, .authenticating, .connected:
            return "Connect"
        }
    }

    private var startAtLoginBinding: Binding<Bool> {
        Binding(
            get: { appState.startAtLogin },
            set: { appState.setStartAtLogin($0) }
        )
    }

    private func openSettingsIfNeeded() {
        guard appState.shouldOpenSettings else { return }
        appState.prepareToShowWindow()
        openWindow(id: "main")
        appState.shouldOpenSettings = false
    }
}
