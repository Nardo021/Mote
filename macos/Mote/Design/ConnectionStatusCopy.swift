import Foundation

enum ConnectionStatusCopy {
    struct InlineError: Equatable, Sendable {
        let title: String
        let detail: String?
    }

    static func showsConfiguredDetails(_ state: ConnectionState) -> Bool {
        switch state {
        case .notConfigured, .pairing:
            return false
        case .disconnected, .connecting, .authenticating, .connected, .reconnecting, .error:
            return true
        }
    }

    static func headerTransportLine(state: ConnectionState, latencyText: String) -> String? {
        switch state {
        case .connected:
            return latencyText == "—" ? "Relay" : "Relay · \(latencyText)"
        case .connecting, .authenticating, .reconnecting:
            return "Relay"
        case .notConfigured, .disconnected, .error, .pairing:
            return nil
        }
    }

    static func menuRelayLine(host: String, latencyText: String, state: ConnectionState) -> String? {
        switch state {
        case .connected:
            return latencyText == "—" ? host : "\(host) · \(latencyText)"
        case .connecting, .authenticating, .reconnecting:
            return host
        case .notConfigured, .disconnected, .error, .pairing:
            return nil
        }
    }

    static func inlineError(state: ConnectionState, lastError: String?) -> InlineError? {
        if lastError == "Could not update Start at Login" {
            return nil
        }

        switch state {
        case .notConfigured, .connected, .disconnected:
            return nil
        case .pairing:
            guard let lastError, !lastError.isEmpty else {
                return nil
            }
            return InlineError(title: lastError, detail: nil)
        case .connecting, .authenticating, .reconnecting:
            guard let lastError, !lastError.isEmpty else {
                return nil
            }
            if isInvalidCredential(lastError) {
                return invalidCredentialError
            }
            return InlineError(title: "Could not connect to relay.", detail: "Retrying automatically…")
        case .error(let message):
            if isInvalidCredential(message) || isInvalidCredential(lastError ?? "") {
                return invalidCredentialError
            }
            if message == "Keychain failure" || lastError == "Keychain failure" {
                return InlineError(
                    title: "Could not read the device credential.",
                    detail: "Mote could not access the Keychain item for this Mac."
                )
            }
            return InlineError(title: "Could not connect to relay.", detail: detail(for: message))
        }
    }

    static func isStartupError(_ lastError: String?) -> Bool {
        lastError == "Could not update Start at Login"
    }

    private static let invalidCredentialError = InlineError(
        title: "Device credential is invalid.",
        detail: "The stored device credential was rejected."
    )

    private static func isInvalidCredential(_ message: String) -> Bool {
        message == "invalid_credentials"
    }

    private static func detail(for message: String) -> String? {
        switch message {
        case "Network unavailable":
            return "The network is unavailable."
        case "DNS failure":
            return "The relay host could not be resolved."
        case "TLS failure":
            return "The secure connection failed."
        case "Connection timed out", "Authentication timed out":
            return "The connection timed out."
        case "Relay unavailable":
            return nil
        default:
            return nil
        }
    }
}
