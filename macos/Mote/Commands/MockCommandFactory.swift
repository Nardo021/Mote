import Foundation

enum MockCommandFactory {
    static func lock(
        deviceID: String,
        id: String = UUID().uuidString,
        createdAt: Int64 = DateHelpers.nowMilliseconds(),
        expiresAt: Int64? = nil,
        nonce: String = UUID().uuidString,
        action: String = MoteAction.lock.rawValue,
        version: Int = ProtocolConstants.version
    ) -> MoteCommand {
        MoteCommand(
            type: "command",
            version: version,
            id: id,
            deviceID: deviceID,
            action: action,
            createdAt: createdAt,
            expiresAt: expiresAt ?? createdAt + ProtocolConstants.commandTTLMilliseconds,
            nonce: nonce
        )
    }
}
