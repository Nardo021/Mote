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
        case .disconnected, .connecting, .authenticating, .connected, .reconnecting, .disabled, .error:
            return true
        }
    }

    static func headerTransportLine(state: ConnectionState, latencyText: String) -> String? {
        switch state {
        case .connected:
            return latencyText == "—" ? "Relay" : "Relay · \(latencyText)"
        case .connecting, .authenticating, .reconnecting:
            return "Relay"
        case .notConfigured, .disconnected, .error, .pairing, .disabled:
            return nil
        }
    }

    static func menuRelayLine(host: String, latencyText: String, state: ConnectionState) -> String? {
        switch state {
        case .connected:
            return latencyText == "—" ? host : "\(host) · \(latencyText)"
        case .connecting, .authenticating, .reconnecting:
            return host
        case .notConfigured, .disconnected, .error, .pairing, .disabled:
            return nil
        }
    }

    static func inlineError(state: ConnectionState, lastError: String?) -> InlineError? {
        if isStartupError(lastError) {
            return nil
        }

        switch state {
        case .connected, .disconnected:
            return nil
        case .notConfigured:
            return pairingError(lastError)
        case .pairing:
            return pairingError(lastError)
        case .connecting, .authenticating, .reconnecting:
            guard let lastError, !lastError.isEmpty else {
                return nil
            }
            if isCredentialRecovery(lastError) {
                return credentialRecoveryError(for: lastError)
            }
            return InlineError(title: "Could not connect to relay.", detail: "Retrying automatically…")
        case .disabled:
            return disabledError
        case .error(let message):
            if isDeviceDisabled(message) || isDeviceDisabled(lastError ?? "") {
                return disabledError
            }
            if isCredentialRecovery(message) || isCredentialRecovery(lastError ?? "") {
                return credentialRecoveryError(for: isCredentialRecovery(message) ? message : lastError)
            }
            if message == "Keychain failure" || lastError == "Keychain failure" {
                return keychainError
            }
            return InlineError(title: "Could not connect to relay.", detail: detail(for: message))
        }
    }

    static func needsCredentialPaste(state: ConnectionState, lastError: String?) -> Bool {
        switch state {
        case .error(let message):
            return isCredentialRecovery(message) || isCredentialRecovery(lastError ?? "")
        case .connecting, .authenticating, .reconnecting:
            return isCredentialRecovery(lastError ?? "")
        case .disabled, .connected, .disconnected, .notConfigured, .pairing:
            return false
        }
    }

    static func isStartupError(_ lastError: String?) -> Bool {
        lastError == "Could not update Start at Login"
    }

    static func startupErrorText(_ lastError: String?) -> String? {
        guard isStartupError(lastError) else {
            return nil
        }
        return "Could not update Start at Login. Try again."
    }

    static func pairingError(_ lastError: String?) -> InlineError? {
        guard let lastError, !lastError.isEmpty, !isStartupError(lastError) else {
            return nil
        }
        switch lastError {
        case "Pairing was denied.":
            return InlineError(
                title: lastError,
                detail: "Allow this Mac in the Dashboard, then pair again."
            )
        case "Pairing expired. Try again.":
            return InlineError(title: "Pairing expired.", detail: "Try again.")
        case "Could not start pairing.", "Could not complete pairing.":
            return InlineError(title: lastError, detail: "Check the network and pair again.")
        default:
            return InlineError(
                title: "Could not start pairing.",
                detail: "Check the network and pair again."
            )
        }
    }

    private static let disabledError = InlineError(
        title: "This Mac is disabled.",
        detail: "Enable this Mac in the Dashboard, then Reconnect."
    )

    private static let rotatedCredentialError = InlineError(
        title: "The device credential was replaced.",
        detail: "Paste the new credential from the Dashboard."
    )

    private static let invalidCredentialError = InlineError(
        title: "Device credential is invalid.",
        detail: "Paste the new credential from the Dashboard."
    )

    private static let keychainError = InlineError(
        title: "Could not read the device credential.",
        detail: "Try again. If it continues, check the Keychain item for this Mac."
    )

    static func isDeviceDisabled(_ message: String) -> Bool {
        message == RelayCloseReason.deviceDisabled.rawValue
    }

    static func isCredentialRecovery(_ message: String) -> Bool {
        message == "invalid_credentials" || message == RelayCloseReason.credentialRotated.rawValue
    }

    private static func credentialRecoveryError(for message: String?) -> InlineError {
        if message == RelayCloseReason.credentialRotated.rawValue {
            return rotatedCredentialError
        }
        return invalidCredentialError
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
