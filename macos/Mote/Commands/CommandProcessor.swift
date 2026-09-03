import Foundation

actor CommandProcessor {
    private let validator: CommandValidator
    private let cache: RecentCommandCache
    private let executor: any MoteActionExecuting

    init(
        deviceID: String,
        executor: any MoteActionExecuting,
        cache: RecentCommandCache = RecentCommandCache(),
        now: @escaping @Sendable () -> Int64 = { DateHelpers.nowMilliseconds() }
    ) {
        self.validator = CommandValidator(expectedDeviceID: deviceID, now: now)
        self.cache = cache
        self.executor = executor
    }

    func process(_ command: MoteCommand) async -> MoteCommandResult {
        MoteLog.commands.info("Command received id=\(command.id, privacy: .public)")

        switch validator.validate(command, seenIDs: cache) {
        case .accepted(let action):
            cache.record(command.id)
            do {
                try await executor.execute(action)
                MoteLog.commands.info("Command executed id=\(command.id, privacy: .public)")
                return .completed(commandID: command.id)
            } catch ActionExecutionError.permissionRequired {
                MoteLog.actions.error("Permission failure id=\(command.id, privacy: .public)")
                return .status(.permissionRequired, commandID: command.id)
            } catch ActionExecutionError.unsupported {
                MoteLog.commands.error("Command unsupported id=\(command.id, privacy: .public)")
                return .status(.unsupported, commandID: command.id)
            } catch {
                MoteLog.commands.error("Command failed id=\(command.id, privacy: .public)")
                return .status(.failed, commandID: command.id, error: "execution_failed")
            }

        case .rejected(let failure):
            MoteLog.commands.error(
                "Command rejected id=\(command.id, privacy: .public) reason=\(String(describing: failure), privacy: .public)"
            )
            return .status(failure.resultStatus, commandID: command.id)
        }
    }
}
