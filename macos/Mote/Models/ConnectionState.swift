import Foundation

enum ConnectionState: Equatable, Sendable {
    case notConfigured
    case disconnected
    case connecting
    case authenticating
    case connected
    case reconnecting
    case error(String)

    var title: String {
        switch self {
        case .notConfigured:
            return "Not Configured"
        case .disconnected:
            return "Disconnected"
        case .connecting:
            return "Connecting…"
        case .authenticating:
            return "Authenticating…"
        case .connected:
            return "Connected"
        case .reconnecting:
            return "Reconnecting…"
        case .error:
            return "Connection Error"
        }
    }

    var debugLabel: String {
        switch self {
        case .notConfigured:
            return "notConfigured"
        case .disconnected:
            return "disconnected"
        case .connecting:
            return "connecting"
        case .authenticating:
            return "authenticating"
        case .connected:
            return "connected"
        case .reconnecting:
            return "reconnecting"
        case .error:
            return "error"
        }
    }

    var menuSymbol: String {
        switch self {
        case .connected, .error:
            return "●"
        case .connecting, .authenticating, .reconnecting:
            return "◌"
        case .notConfigured, .disconnected:
            return "○"
        }
    }

    var menuTitle: String {
        "\(menuSymbol) \(title)"
    }

    var isActivelyConnecting: Bool {
        switch self {
        case .connecting, .authenticating, .reconnecting:
            return true
        case .notConfigured, .disconnected, .connected, .error:
            return false
        }
    }
}
