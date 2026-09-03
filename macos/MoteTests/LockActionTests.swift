import XCTest
@testable import Mote

final class LockActionTests: XCTestCase {
    func testSessionLockSkipsAccessibilityAndFallback() throws {
        let fallback = LockCounter()
        let action = LockAction(
            sessionLock: { true },
            isTrusted: {
                XCTFail("Session lock should not check Accessibility")
                return false
            },
            fallbackLock: { fallback.value += 1 }
        )

        try action.lockScreen()
        XCTAssertEqual(fallback.value, 0)
    }

    func testMissingSessionLockRequiresAccessibility() {
        let action = LockAction(
            sessionLock: { false },
            isTrusted: { false },
            fallbackLock: {
                XCTFail("Fallback should not run without Accessibility")
            }
        )

        XCTAssertThrowsError(try action.lockScreen()) { error in
            XCTAssertEqual(error as? ActionExecutionError, .permissionRequired)
        }
    }

    func testFallbackRunsWhenSessionLockFailsAndTrusted() throws {
        let fallback = LockCounter()
        let action = LockAction(
            sessionLock: { false },
            isTrusted: { true },
            fallbackLock: { fallback.value += 1 }
        )

        try action.lockScreen()
        XCTAssertEqual(fallback.value, 1)
    }

    func testLoginSessionSymbolResolvesWithoutLocking() {
        XCTAssertTrue(
            LoginSession.isAvailable,
            "SACLockScreenImmediate should resolve from login.framework on this Mac"
        )
    }
}

private final class LockCounter: @unchecked Sendable {
    var value = 0
}
