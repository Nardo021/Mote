import XCTest
@testable import Mote

final class CommandProcessorTests: XCTestCase {
    func testValidCommandExecutesMockActionOnly() async {
        let executor = RecordingActionExecutor()
        let processor = CommandProcessor(
            deviceID: "device-1",
            executor: executor,
            now: { 1_000_000 }
        )
        let command = MockCommandFactory.lock(deviceID: "device-1", createdAt: 1_000_000, expiresAt: 1_010_000)
        let result = await processor.process(command)
        XCTAssertEqual(result.status, .completed)
        XCTAssertEqual(executor.executed, [.lock])
    }

    func testExpiredCommandDoesNotExecute() async {
        let executor = RecordingActionExecutor()
        let processor = CommandProcessor(
            deviceID: "device-1",
            executor: executor,
            now: { 1_000_000 }
        )
        let command = MockCommandFactory.lock(deviceID: "device-1", createdAt: 900_000, expiresAt: 910_000)
        let result = await processor.process(command)
        XCTAssertEqual(result.status, .expired)
        XCTAssertTrue(executor.executed.isEmpty)
    }

    func testWrongDeviceDoesNotExecute() async {
        let executor = RecordingActionExecutor()
        let processor = CommandProcessor(deviceID: "device-1", executor: executor, now: { 1_000_000 })
        let command = MockCommandFactory.lock(deviceID: "nope", createdAt: 1_000_000, expiresAt: 1_010_000)
        let result = await processor.process(command)
        XCTAssertEqual(result.status, .invalid)
        XCTAssertTrue(executor.executed.isEmpty)
    }

    func testDuplicateDoesNotExecuteTwice() async {
        let executor = RecordingActionExecutor()
        let processor = CommandProcessor(deviceID: "device-1", executor: executor, now: { 1_000_000 })
        let command = MockCommandFactory.lock(
            deviceID: "device-1",
            id: "dup",
            createdAt: 1_000_000,
            expiresAt: 1_010_000
        )
        let first = await processor.process(command)
        let second = await processor.process(command)
        XCTAssertEqual(first.status, .completed)
        XCTAssertEqual(second.status, .invalid)
        XCTAssertEqual(executor.executed, [.lock])
    }

    func testPermissionFailureMapsToResult() async {
        let executor = RecordingActionExecutor()
        executor.errorToThrow = ActionExecutionError.permissionRequired
        let processor = CommandProcessor(deviceID: "device-1", executor: executor, now: { 1_000_000 })
        let command = MockCommandFactory.lock(deviceID: "device-1", createdAt: 1_000_000, expiresAt: 1_010_000)
        let result = await processor.process(command)
        XCTAssertEqual(result.status, .permissionRequired)
    }

    func testActionExecutorDoesNotLockOnUnsupportedAction() async throws {
        let lock = RecordingScreenLock()
        let executor = ActionExecutor(lockScreen: lock)
        do {
            try await executor.execute(.sleep)
            XCTFail("Expected unsupported")
        } catch ActionExecutionError.unsupported {
            XCTAssertEqual(lock.lockCount, 0)
        }
    }
}
