import XCTest
@testable import Mote

final class ReconnectPolicyTests: XCTestCase {
    func testBaseBackoffSequenceAndCap() {
        var policy = ReconnectPolicy()
        policy.randomUnitInterval = { 0 }
        XCTAssertEqual(policy.baseDelay(forAttempt: 0), 1)
        XCTAssertEqual(policy.baseDelay(forAttempt: 1), 2)
        XCTAssertEqual(policy.baseDelay(forAttempt: 2), 4)
        XCTAssertEqual(policy.baseDelay(forAttempt: 3), 8)
        XCTAssertEqual(policy.baseDelay(forAttempt: 4), 15)
        XCTAssertEqual(policy.baseDelay(forAttempt: 5), 30)
        XCTAssertEqual(policy.baseDelay(forAttempt: 12), 30)
        XCTAssertEqual(policy.delay(forAttempt: 8), 30)
    }

    func testJitterStaysWithinCap() {
        var policy = ReconnectPolicy()
        policy.randomUnitInterval = { 1 }
        XCTAssertLessThanOrEqual(policy.delay(forAttempt: 5), ReconnectPolicy.cap)
        policy.randomUnitInterval = { -1 }
        XCTAssertGreaterThanOrEqual(policy.delay(forAttempt: 0), 0.1)
    }
}
