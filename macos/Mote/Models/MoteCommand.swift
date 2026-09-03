import Foundation

struct MoteCommand: Codable, Equatable, Sendable, Identifiable {
    var type: String
    var version: Int
    var id: String
    var deviceID: String
    var action: String
    var createdAt: Int64
    var expiresAt: Int64
    var nonce: String

    enum CodingKeys: String, CodingKey {
        case type
        case version
        case id
        case deviceID = "device_id"
        case action
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case nonce
    }

    var parsedAction: MoteAction? {
        MoteAction(rawValue: action)
    }
}
