import XCTest
@testable import Mote

@MainActor
final class AppStatePairingTests: XCTestCase {
    func testApprovedPairingSavesCredentialAndLeavesUnconfigured() async throws {
        let pairing = MockPairingService()
        pairing.decision = .approved(
            deviceID: "device-1",
            credential: "paired-credential",
            name: "Leo’s MacBook"
        )
        let store = InMemoryKeychainStore()
        let state = AppState(credentials: CredentialManager(store: store), pairing: pairing)
        state.deviceID = "device-1"
        state.deviceName = "Leo’s MacBook"

        state.beginPairing()
        await state.waitForPairingToFinish()

        let stored = try await state.credentials.load()
        XCTAssertEqual(stored, "paired-credential")
        XCTAssertTrue(state.wantsConnection)
        XCTAssertEqual(state.connectionState, .disconnected)
        XCTAssertFalse(state.isUnconfigured)
        XCTAssertNil(state.lastError)
    }

    func testRejectedPairingReturnsToNotConfigured() async throws {
        let pairing = MockPairingService()
        pairing.decision = .rejected(reason: "rejected")
        let state = AppState(
            credentials: CredentialManager(store: InMemoryKeychainStore()),
            pairing: pairing
        )

        state.beginPairing()
        await state.waitForPairingToFinish()

        XCTAssertEqual(state.connectionState, .notConfigured)
        XCTAssertEqual(state.lastError, "Pairing was denied.")
        let stored = try await state.credentials.load()
        XCTAssertNil(stored)
    }

    func testExpiredPairingReturnsToNotConfigured() async {
        let pairing = MockPairingService()
        pairing.decision = .expired
        let state = AppState(
            credentials: CredentialManager(store: InMemoryKeychainStore()),
            pairing: pairing
        )

        state.beginPairing()
        await state.waitForPairingToFinish()

        XCTAssertEqual(state.connectionState, .notConfigured)
        XCTAssertEqual(state.lastError, "Pairing expired. Try again.")
    }

    func testCancelPairingCallsCancelAndResetsState() async {
        let pairing = MockPairingService()
        pairing.holdDecision = true
        let state = AppState(
            credentials: CredentialManager(store: InMemoryKeychainStore()),
            pairing: pairing
        )
        state.deviceID = "device-1"

        state.beginPairing()
        await pairing.waitUntilWaiting()
        XCTAssertEqual(state.connectionState, .pairing)

        state.cancelPairing()
        await state.waitForPairingToFinish()

        XCTAssertEqual(state.connectionState, .notConfigured)
        XCTAssertEqual(pairing.cancelCount, 1)
    }

    func testCopyShortcutBearerHeaderDoesNotPersistToken() {
        let state = AppState(credentials: CredentialManager(store: InMemoryKeychainStore()))
        state.shortcutTokenInput = "shortcut-token"
        state.copyShortcutBearerHeader()
        XCTAssertEqual(state.shortcutTokenInput, "shortcut-token")
        XCTAssertEqual(NSPasteboard.general.string(forType: .string), "Bearer shortcut-token")
    }

    func testEmptyShortcutTokenIsNotCopied() {
        let state = AppState(credentials: CredentialManager(store: InMemoryKeychainStore()))
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString("keep", forType: .string)
        state.shortcutTokenInput = "   "
        XCTAssertFalse(state.canCopyShortcutBearer)
        state.copyShortcutBearerHeader()
        XCTAssertEqual(NSPasteboard.general.string(forType: .string), "keep")
    }
}

final class MockPairingService: PairingServicing, @unchecked Sendable {
    var created = PairCreated(requestID: "request-1", pairSecret: "pair-secret", expiresAt: 1)
    var decision: PairDecision = .approved(deviceID: "device-1", credential: "cred", name: "Mac")
    var createError: Error?
    var holdDecision = false
    var cancelCount = 0
    private var waitingContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    func createRequest(
        configuration: RelayConfiguration,
        deviceID: String,
        deviceName: String
    ) async throws -> PairCreated {
        if let createError {
            throw createError
        }
        return created
    }

    func waitForDecision(
        configuration: RelayConfiguration,
        requestID: String,
        pairSecret: String
    ) async throws -> PairDecision {
        if holdDecision {
            await withCheckedContinuation { continuation in
                waitingContinuation = continuation
            }
            try Task.checkCancellation()
        }
        return decision
    }

    func cancel(
        configuration: RelayConfiguration,
        requestID: String,
        pairSecret: String
    ) async throws {
        cancelCount += 1
        waitingContinuation?.resume()
        waitingContinuation = nil
    }

    func waitUntilWaiting() async {
        while waitingContinuation == nil {
            await Task.yield()
        }
    }
}
