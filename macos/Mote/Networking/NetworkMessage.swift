import Foundation

struct MessageEnvelope: Decodable, Sendable {
    let type: String
}

struct AuthMessage: Encodable, Sendable {
    var type: String = "auth"
    var version: Int = ProtocolConstants.version
    var deviceID: String
    var credential: String
    var appVersion: String

    enum CodingKeys: String, CodingKey {
        case type
        case version
        case deviceID = "device_id"
        case credential
        case appVersion = "app_version"
    }
}

struct AuthResultMessage: Decodable, Equatable, Sendable {
    var type: String
    var version: Int
    var status: String
    var error: String?

    var isSuccessful: Bool {
        status == "ok"
    }
}

struct HeartbeatMessage: Encodable, Sendable {
    var type: String = "heartbeat"
    var version: Int = ProtocolConstants.version
    var deviceID: String
    var sentAt: Int64

    enum CodingKeys: String, CodingKey {
        case type
        case version
        case deviceID = "device_id"
        case sentAt = "sent_at"
    }
}

struct HeartbeatAckMessage: Decodable, Equatable, Sendable {
    var type: String
    var version: Int
    var sentAt: Int64
    var serverAt: Int64

    enum CodingKeys: String, CodingKey {
        case type
        case version
        case sentAt = "sent_at"
        case serverAt = "server_at"
    }
}

struct RelayErrorMessage: Decodable, Equatable, Sendable {
    var type: String
    var version: Int?
    var error: String?
}

enum IncomingRelayMessage: Sendable {
    case authResult(AuthResultMessage)
    case heartbeatAck(HeartbeatAckMessage)
    case command(MoteCommand)
    case error(RelayErrorMessage)
    case unknown(type: String)

    static func decode(from data: Data) throws -> IncomingRelayMessage {
        let decoder = JSONDecoder()
        let envelope = try decoder.decode(MessageEnvelope.self, from: data)
        switch envelope.type {
        case "auth_result":
            return .authResult(try decoder.decode(AuthResultMessage.self, from: data))
        case "heartbeat_ack":
            return .heartbeatAck(try decoder.decode(HeartbeatAckMessage.self, from: data))
        case "command":
            return .command(try decoder.decode(MoteCommand.self, from: data))
        case "error":
            return .error(try decoder.decode(RelayErrorMessage.self, from: data))
        default:
            return .unknown(type: envelope.type)
        }
    }
}

enum ProtocolJSON {
    static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(value)
    }

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        try JSONDecoder().decode(type, from: data)
    }
}
