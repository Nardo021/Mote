import Foundation

enum CommandValidationFailure: Equatable, Sendable {
    case invalidVersion
    case missingCommandID
    case wrongDevice
    case unknownAction
    case unsupportedAction
    case expired
    case invalidTimestamp
    case missingNonce
    case duplicate

    var resultStatus: CommandResultStatus {
        switch self {
        case .expired:
            return .expired
        case .unknownAction, .unsupportedAction:
            return .unsupported
        case .invalidVersion, .missingCommandID, .wrongDevice, .invalidTimestamp, .missingNonce, .duplicate:
            return .invalid
        }
    }
}

enum CommandValidationResult: Equatable, Sendable {
    case accepted(MoteAction)
    case rejected(CommandValidationFailure)
}

struct CommandValidator: Sendable {
    var expectedDeviceID: String
    var now: @Sendable () -> Int64 = { DateHelpers.nowMilliseconds() }
    var maxFutureSkewMilliseconds: Int64 = 120_000

    func validate(_ command: MoteCommand, seenIDs: RecentCommandCache) -> CommandValidationResult {
        if command.version != ProtocolConstants.version {
            return .rejected(.invalidVersion)
        }
        if command.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .rejected(.missingCommandID)
        }
        if command.deviceID != expectedDeviceID {
            return .rejected(.wrongDevice)
        }
        if command.nonce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .rejected(.missingNonce)
        }

        let timestamp = now()
        if command.createdAt <= 0 || command.expiresAt <= 0 || command.createdAt > command.expiresAt {
            return .rejected(.invalidTimestamp)
        }
        if command.createdAt > timestamp + maxFutureSkewMilliseconds {
            return .rejected(.invalidTimestamp)
        }
        if timestamp > command.expiresAt {
            return .rejected(.expired)
        }

        guard let action = command.parsedAction else {
            return .rejected(.unknownAction)
        }
        if !action.isImplemented {
            return .rejected(.unsupportedAction)
        }
        if seenIDs.contains(command.id) {
            return .rejected(.duplicate)
        }

        return .accepted(action)
    }
}
