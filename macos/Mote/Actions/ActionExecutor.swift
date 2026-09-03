import Foundation

protocol MoteActionExecuting: Sendable {
    func execute(_ action: MoteAction) async throws
}

actor ActionExecutor: MoteActionExecuting {
    private let lockScreen: any ScreenLocking

    init(lockScreen: any ScreenLocking = LockAction()) {
        self.lockScreen = lockScreen
    }

    func execute(_ action: MoteAction) async throws {
        switch action {
        case .lock:
            try lockScreen.lockScreen()
        case .sleep, .mute, .unmute, .playPause:
            throw ActionExecutionError.unsupported
        }
    }
}
