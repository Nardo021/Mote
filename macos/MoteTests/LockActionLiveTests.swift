import XCTest
@testable import Mote

/// Hosted in the app process. Resolves the private lock symbol and does not call it.
/// The safe test plan skips this class. The test also refuses to run unless
/// `MOTE_RUN_SIDE_EFFECT_TESTS=1`, so a full-target run cannot load it by accident.
final class LockActionLiveTests: XCTestCase {
    func testLoginSessionSymbolResolvesWithoutLocking() throws {
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["MOTE_RUN_SIDE_EFFECT_TESTS"] == "1",
            "Side-effect test skipped. Set MOTE_RUN_SIDE_EFFECT_TESTS=1 to resolve the private login symbol. This test does not lock the session."
        )
        XCTAssertTrue(
            LoginSession.isAvailable,
            "The private login symbol should resolve on this Mac without being called."
        )
    }
}
