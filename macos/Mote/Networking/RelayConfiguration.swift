import Foundation

enum ProtocolConstants {
    static let version = 1
    static let commandTTLMilliseconds: Int64 = 10_000
    static let heartbeatIntervalSeconds: TimeInterval = 30
    static let authTimeoutSeconds: TimeInterval = 10
    static let stableConnectionResetSeconds: TimeInterval = 10
    static let webSocketPath = "/v1/ws/device"
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
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) ?? URLComponents()
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
        components.path = ProtocolConstants.webSocketPath
        components.query = nil
        components.fragment = nil
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
