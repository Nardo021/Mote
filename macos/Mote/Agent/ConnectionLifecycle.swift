import Foundation

enum ConnectionPhase: Equatable, Sendable {
    case idle
    case waitingForCredential
    case connecting
    case authenticating
    case connected
    case reconnecting
    case stopped
}

enum ConnectionLifecycle {
    static func state(phase: ConnectionPhase, configured: Bool, lastError: String?) -> ConnectionState {
        if !configured {
            return .notConfigured
        }
        switch phase {
        case .idle, .stopped:
            return .disconnected
        case .waitingForCredential:
            return .notConfigured
        case .connecting:
            return .connecting
        case .authenticating:
            return .authenticating
        case .connected:
            return .connected
        case .reconnecting:
            return .reconnecting
        }
    }
}
