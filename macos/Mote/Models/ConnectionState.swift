import Foundation

enum ConnectionState: Equatable, Sendable {
    case notConfigured
    case pairing
    case disconnected
    case connecting
    case authenticating
    case connected
    case reconnecting
    case disabled
    case error(String)

    var title: String {
        switch self {
        case .notConfigured:
            return "Not Configured"
        case .pairing:
            return "Waiting for Approval…"
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
        case .disabled:
            return "Disabled"
        case .error:
            return "Connection Error"
        }
    }

    var debugLabel: String {
        switch self {
        case .notConfigured:
            return "notConfigured"
        case .pairing:
            return "pairing"
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
        case .disabled:
            return "disabled"
        case .error:
            return "error"
        }
    }

    var menuSymbol: String {
        switch self {
        case .connected, .error, .disabled:
            return "●"
        case .connecting, .authenticating, .reconnecting:
            return "◌"
        case .notConfigured, .disconnected:
            return "○"
        case .pairing:
            return "◌"
        }
    }

    var menuTitle: String {
        "\(menuSymbol) \(title)"
    }

    var isActivelyConnecting: Bool {
        switch self {
        case .connecting, .authenticating, .reconnecting, .pairing:
            return true
        case .notConfigured, .disconnected, .connected, .error, .disabled:
            return false
        }
    }

    func statusTone(persistWarning: Bool) -> MoteStatusTone {
        switch self {
        case .connected:
            return .success
        case .connecting, .authenticating, .pairing:
            return .accent
        case .reconnecting:
            return persistWarning ? .warning : .accent
        case .error:
            return .error
        case .disabled:
            return .warning
        case .disconnected, .notConfigured:
            return .offline
        }
    }
}
