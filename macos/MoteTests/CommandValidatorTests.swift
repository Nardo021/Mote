import XCTest
@testable import Mote

final class CommandValidatorTests: XCTestCase {
    private let deviceID = "device-1"
    private let now: Int64 = 1_000_000
    private var cache: RecentCommandCache!
    private var validator: CommandValidator!

    override func setUp() {
        super.setUp()
        cache = RecentCommandCache(limit: 4)
        validator = CommandValidator(expectedDeviceID: deviceID, now: { [now] in now })
    }

    func testAcceptsValidLockCommand() {
        let command = MockCommandFactory.lock(deviceID: deviceID, createdAt: now, expiresAt: now + 10_000)
        let result = validator.validate(command, seenIDs: cache)
        XCTAssertEqual(result, .accepted(.lock))
    }

    func testRejectsUnknownAction() {
        let command = MockCommandFactory.lock(
            deviceID: deviceID,
            createdAt: now,
            expiresAt: now + 10_000,
            action: "wipe_disk"
        )
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .rejected(.unknownAction))
    }

    func testRejectsReservedUnimplementedAction() {
        let command = MockCommandFactory.lock(
            deviceID: deviceID,
            createdAt: now,
            expiresAt: now + 10_000,
            action: "sleep"
        )
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .rejected(.unsupportedAction))
    }

    func testRejectsWrongDevice() {
        let command = MockCommandFactory.lock(deviceID: "other", createdAt: now, expiresAt: now + 10_000)
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .rejected(.wrongDevice))
    }

    func testRejectsExpiredCommand() {
        let command = MockCommandFactory.lock(deviceID: deviceID, createdAt: now - 20_000, expiresAt: now - 1)
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .rejected(.expired))
    }

    func testRejectsDuplicateCommandID() {
        let command = MockCommandFactory.lock(
            deviceID: deviceID,
            id: "same",
            createdAt: now,
            expiresAt: now + 10_000
        )
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .accepted(.lock))
        cache.record(command.id)
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .rejected(.duplicate))
    }

    func testRejectsInvalidVersion() {
        let command = MockCommandFactory.lock(
            deviceID: deviceID,
            createdAt: now,
            expiresAt: now + 10_000,
            version: 99
        )
        XCTAssertEqual(validator.validate(command, seenIDs: cache), .rejected(.invalidVersion))
    }

    func testCacheDoesNotGrowWithoutBound() {
        let bounded = RecentCommandCache(limit: 3)
        for index in 0..<10 {
            bounded.record("id-\(index)")
        }
        XCTAssertEqual(bounded.count, 3)
        XCTAssertFalse(bounded.contains("id-0"))
        XCTAssertTrue(bounded.contains("id-9"))
    }
}
