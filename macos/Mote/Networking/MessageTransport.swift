import Foundation

enum RelayCloseReason: String, Sendable, CaseIterable {
    case deviceDisabled = "device_disabled"
    case credentialRotated = "credential_rotated"
    case invalidCredentials = "invalid_credentials"
    case unsupportedVersion = "unsupported_version"
    case authTimeout = "auth_timeout"
    case heartbeatStale = "heartbeat_stale"
    case superseded = "superseded"
    case expired = "expired"
    case serverShutdown = "server_shutdown"
    case socketError = "socket_error"

    /// Administrative closes that must not start another connection.
    /// `invalid_credentials` and `unsupported_version` match the auth_result
    /// path: the user has to paste a credential or update the app. Transient
    /// transport closes, including unknown future reasons, stay reconnectable.
    var stopsReconnect: Bool {
        switch self {
        case .deviceDisabled, .credentialRotated, .invalidCredentials, .unsupportedVersion:
            return true
        case .authTimeout, .heartbeatStale, .superseded, .expired, .serverShutdown, .socketError:
            return false
        }
    }
}

enum TransportError: Error, Equatable, Sendable {
    case notConnected
    case invalidUTF8
    case invalidRelayResponse
    case cancelled
    case closed(reason: String?)
}

protocol MessageTransport: Sendable {
    func connect() async throws
    func send(_ data: Data) async throws
    func receive() async throws -> Data
    func close(reason: String?) async
}
