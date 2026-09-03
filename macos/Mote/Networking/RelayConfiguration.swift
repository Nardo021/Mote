import Foundation

enum ProtocolConstants {
    static let version = 1
    static let commandTTLMilliseconds: Int64 = 10_000
    static let heartbeatIntervalSeconds: TimeInterval = 30
    static let authTimeoutSeconds: TimeInterval = 10
    static let stableConnectionResetSeconds: TimeInterval = 10
    static let webSocketPath = "/v1/ws/device"
    static let pairWebSocketPath = "/v1/ws/pair"
    static let pairRequestsPath = "/v1/pair/requests"
}

enum RelayDefaults {
    static let productionHost = "relay.yanze.me"
    static let productionBaseURLString = "https://relay.yanze.me"
    static let environmentURLKey = "MOTE_RELAY_URL"
    static let environmentCredentialKey = "MOTE_DEVICE_CREDENTIAL"
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

    func pairWebSocketURL(requestID: String, pairSecret: String) -> URL {
        socketURL(
            path: ProtocolConstants.pairWebSocketPath,
            query: [
                "request_id": requestID,
                "pair_secret": pairSecret,
            ]
        )
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

    static var production: RelayConfiguration {
        let fallback = URL(string: "https://localhost") ?? URL(fileURLWithPath: "/")
        let url = URL(string: RelayDefaults.productionBaseURLString) ?? fallback
        return RelayConfiguration(baseURL: url)
    }

    static func resolve(settingsOverride: String? = nil) -> RelayConfiguration {
        if let environment = ProcessInfo.processInfo.environment[RelayDefaults.environmentURLKey],
           let url = URL(string: environment),
           url.scheme != nil {
            return RelayConfiguration(baseURL: url)
        }

        #if DEBUG
        if let settingsOverride,
           let url = URL(string: settingsOverride),
           url.scheme != nil {
            return RelayConfiguration(baseURL: url)
        }
        #endif

        return .production
    }
}
