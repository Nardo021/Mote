import Foundation

enum CommandResultStatus: String, Codable, Sendable {
    case completed
    case failed
    case expired
    case invalid
    case unsupported
    case permissionRequired = "permission_required"
}

struct MoteCommandResult: Codable, Equatable, Sendable {
    var type: String
    var version: Int
    var commandID: String
    var status: CommandResultStatus
    var completedAt: Int64
    var error: String?

    enum CodingKeys: String, CodingKey {
        case type
        case version
        case commandID = "command_id"
        case status
        case completedAt = "completed_at"
        case error
    }

    static func status(
        _ status: CommandResultStatus,
        commandID: String,
        completedAt: Int64 = DateHelpers.nowMilliseconds(),
        error: String? = nil
    ) -> MoteCommandResult {
        MoteCommandResult(
            type: "command_result",
            version: ProtocolConstants.version,
            commandID: commandID,
            status: status,
            completedAt: completedAt,
            error: error
        )
    }

    static func completed(commandID: String) -> MoteCommandResult {
        .status(.completed, commandID: commandID)
    }
}
