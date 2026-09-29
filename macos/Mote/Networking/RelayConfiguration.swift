import Foundation

enum ProtocolConstants {
    /// Wire version. Canonical value is protocol/catalogue.json `version`.
    static let version = 1
    /// Client expectation for command lifetime. The Relay TTL is server configuration.
    static let commandTTLMilliseconds: Int64 = 10_000
    /// How often this Mac sends heartbeat frames. Not a wire requirement.
    static let heartbeatIntervalSeconds: TimeInterval = 30
    /// How long this Mac waits for auth_result before it reconnects.
    static let authTimeoutSeconds: TimeInterval = 10
    static let stableConnectionResetSeconds: TimeInterval = 10
    /// Canonical path: protocol/catalogue.json `paths.deviceWebSocket`.
    static let webSocketPath = "/v1/ws/device"
    /// Canonical path: protocol/catalogue.json `paths.pairWebSocket`.
    static let pairWebSocketPath = "/v1/ws/pair"
    static let pairRequestsPath = "/v1/pair/requests"
}

enum RelayDefaults {
    static let environmentURLKey = "MOTE_RELAY_URL"
    static let environmentCredentialKey = "MOTE_DEVICE_CREDENTIAL"
    /// Text-field hint only. Mote never dials this string.
    static let urlFieldPlaceholder = "https://"
}

struct RelayConfiguration: Equatable, Sendable {
    let baseURL: URL

    var hostDisplayName: String {
        baseURL.host ?? baseURL.absoluteString
    }

    var webSocketURL: URL {
        socketURL(path: ProtocolConstants.webSocketPath)
    }

    var pairRequestsURL: URL {
        httpURL(path: ProtocolConstants.pairRequestsPath)
    }

    func pairCancelURL(requestID: String) -> URL {
        httpURL(path: "\(ProtocolConstants.pairRequestsPath)/\(requestID)/cancel")
    }

    var pairWebSocketURL: URL {
        socketURL(path: ProtocolConstants.pairWebSocketPath)
    }

    func shortcutSetupURL(deviceID: String) -> URL {
        httpURL(path: "/s/\(deviceID)")
    }

    func commandURL(deviceID: String) -> URL {
        httpURL(path: "/v1/devices/\(deviceID)/commands")
    }

    private func httpURL(path: String, query: [String: String] = [:]) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) ?? URLComponents()
        components.path = path
        components.fragment = nil
        components.queryItems = query.isEmpty
            ? nil
            : query
                .map { URLQueryItem(name: $0.key, value: $0.value) }
                .sorted { $0.name < $1.name }
        return components.url ?? baseURL
    }

    private func socketURL(path: String, query: [String: String] = [:]) -> URL {
        var components = URLComponents(url: httpURL(path: path, query: query), resolvingAgainstBaseURL: false) ?? URLComponents()
        switch components.scheme {
        case "https":
            components.scheme = "wss"
        case "http":
            components.scheme = "ws"
        case "wss", "ws":
            break
        default:
            components.scheme = "wss"
        }
        return components.url ?? baseURL
    }

    /// `MOTE_RELAY_URL`, then the settings override. No built-in hostname.
    /// Missing or invalid input returns nil so the app stays not configured.
    static func resolve(settingsOverride: String? = nil) -> RelayConfiguration? {
        if let environment = ProcessInfo.processInfo.environment[RelayDefaults.environmentURLKey],
           let url = parseBaseURL(environment) {
            return RelayConfiguration(baseURL: url)
        }

        if let settingsOverride, let url = parseBaseURL(settingsOverride) {
            return RelayConfiguration(baseURL: url)
        }

        return nil
    }

    static func parseBaseURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host != nil
        else {
            return nil
        }
        return url
    }
}
