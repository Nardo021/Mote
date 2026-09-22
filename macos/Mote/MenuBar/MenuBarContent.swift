import Foundation

enum MenuBarAction: String, Equatable, Sendable {
    case openMote = "Open Mote"
    case connect = "Connect"
    case reconnect = "Reconnect"
    case quit = "Quit Mote"

    var title: String { rawValue }
}

enum MenuBarItem: Equatable, Sendable {
    case status(title: String, tone: MoteStatusTone, filledDot: Bool)
    case disabled(String)
    case action(MenuBarAction)
    case separator
}

struct MenuBarSnapshot: Equatable, Sendable {
    var connectionState: ConnectionState
    var deviceName: String
    var isUnconfigured: Bool
    var isPairing: Bool
    var persistReconnectingWarning: Bool
}

enum MenuBarContent {
    static func items(for snapshot: MenuBarSnapshot) -> [MenuBarItem] {
        var items: [MenuBarItem] = [
            statusItem(for: snapshot),
            .disabled(snapshot.deviceName),
            .separator,
            .action(.openMote),
        ]

        if let action = connectionAction(for: snapshot) {
            items.append(.action(action))
        }

        items.append(.separator)
        items.append(.action(.quit))
        return items
    }

    static func statusItem(for snapshot: MenuBarSnapshot) -> MenuBarItem {
        .status(
            title: statusTitle(for: snapshot),
            tone: snapshot.connectionState.statusTone(persistWarning: snapshot.persistReconnectingWarning),
            filledDot: usesFilledDot(snapshot.connectionState)
        )
    }

    static func statusTitle(for snapshot: MenuBarSnapshot) -> String {
        if snapshot.isUnconfigured && !snapshot.isPairing {
            return "Mote is not configured"
        }
        return snapshot.connectionState.title
    }

    static func connectionAction(for snapshot: MenuBarSnapshot) -> MenuBarAction? {
        guard !snapshot.isUnconfigured else {
            return nil
        }
        switch snapshot.connectionState {
        case .disconnected, .error, .reconnecting, .disabled:
            return .reconnect
        case .notConfigured, .pairing, .connecting, .authenticating, .connected:
            return nil
        }
    }

    static func usesFilledDot(_ state: ConnectionState) -> Bool {
        switch state {
        case .connected, .error, .disabled:
            return true
        case .notConfigured, .pairing, .disconnected, .connecting, .authenticating, .reconnecting:
            return false
        }
    }
}

@MainActor
extension MenuBarSnapshot {
    init(state: AppState) {
        self.init(
            connectionState: state.connectionState,
            deviceName: state.deviceName,
            isUnconfigured: state.isUnconfigured,
            isPairing: state.isPairing,
            persistReconnectingWarning: state.persistReconnectingWarning
        )
    }
}
