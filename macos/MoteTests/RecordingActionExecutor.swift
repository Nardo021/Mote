import Foundation
@testable import Mote

final class RecordingActionExecutor: MoteActionExecuting, @unchecked Sendable {
    private(set) var executed: [MoteAction] = []
    var errorToThrow: Error?

    func execute(_ action: MoteAction) async throws {
        if let errorToThrow {
            throw errorToThrow
        }
        executed.append(action)
    }
}

final class RecordingScreenLock: ScreenLocking, @unchecked Sendable {
    private(set) var lockCount = 0
    var errorToThrow: Error?

    func lockScreen() throws {
        if let errorToThrow {
            throw errorToThrow
        }
        lockCount += 1
    }
}
