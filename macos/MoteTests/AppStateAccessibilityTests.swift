import XCTest
@testable import Mote

@MainActor
final class AppStateAccessibilityTests: XCTestCase {
    func testRefreshPermissionsReadsCurrentAccessibilityTrust() {
        let trust = MockAccessibilityTrust(isTrusted: false)
        let state = AppState(
            credentials: CredentialManager(store: InMemoryKeychainStore()),
            isAccessibilityTrusted: { trust.isTrusted }
        )
        state.lockPermissionGranted = true

        state.refreshPermissionsAndLoginItem()
        XCTAssertFalse(state.lockPermissionGranted)

        trust.isTrusted = true
        state.refreshPermissionsAndLoginItem()
        XCTAssertTrue(state.lockPermissionGranted)
    }
}

@MainActor
final class AccessibilityTrustMonitorTests: XCTestCase {
    func testAccessibilityAPIChangeRefreshesAfterScheduledDelay() {
        var refreshCount = 0
        var scheduledWork: (() -> Void)?
        let monitor = AccessibilityTrustMonitor(
            refresh: { refreshCount += 1 },
            schedule: { _, work in scheduledWork = work }
        )

        monitor.accessibilityAPIDidChange()
        XCTAssertEqual(refreshCount, 0)
        XCTAssertNotNil(scheduledWork)

        scheduledWork?()
        XCTAssertEqual(refreshCount, 1)
    }

    func testPollRefreshesImmediately() {
        var refreshCount = 0
        let monitor = AccessibilityTrustMonitor(refresh: { refreshCount += 1 })

        monitor.poll()
        XCTAssertEqual(refreshCount, 1)
    }
}

@MainActor
final class MockAccessibilityTrust {
    var isTrusted: Bool

    init(isTrusted: Bool) {
        self.isTrusted = isTrusted
    }
}
