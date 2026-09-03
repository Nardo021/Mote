import XCTest
@testable import Mote

@MainActor
final class AppStateCredentialTests: XCTestCase {
    func testSaveDeviceCredentialPersistsAndClearsInput() async throws {
        let store = InMemoryKeychainStore()
        let state = AppState(credentials: CredentialManager(store: store))
        state.credentialInput = "  device-credential  "

        await state.saveDeviceCredential()

        let stored = try await state.credentials.load()
        XCTAssertEqual(stored, "device-credential")
        XCTAssertEqual(state.credentialInput, "")
        XCTAssertNil(state.lastError)
        XCTAssertTrue(state.wantsConnection)
    }

    func testClearDeviceCredentialRemovesStoredValue() async throws {
        let store = InMemoryKeychainStore()
        let state = AppState(credentials: CredentialManager(store: store))
        state.credentialInput = "device-credential"
        await state.saveDeviceCredential()

        await state.clearDeviceCredential()

        let stored = try await state.credentials.load()
        XCTAssertNil(stored)
        XCTAssertEqual(state.connectionState, .notConfigured)
        XCTAssertFalse(state.wantsConnection)
        XCTAssertNil(state.lastError)
    }

    func testDisabledUsesReconnectAndHidesPaste() {
        let state = AppState(credentials: CredentialManager(store: InMemoryKeychainStore()))
        state.connectionState = .disabled
        state.lastError = RelayCloseReason.deviceDisabled.rawValue
        state.wantsConnection = true

        XCTAssertEqual(state.connectActionTitle, "Reconnect")
        XCTAssertFalse(state.needsCredentialPaste)
        XCTAssertFalse(state.showsDisconnectAction)
        XCTAssertFalse(state.isUnconfigured)
    }

    func testRotatedCredentialShowsPasteRecovery() {
        let state = AppState(credentials: CredentialManager(store: InMemoryKeychainStore()))
        state.connectionState = .error(RelayCloseReason.credentialRotated.rawValue)
        state.lastError = RelayCloseReason.credentialRotated.rawValue
        state.wantsConnection = true

        XCTAssertTrue(state.needsCredentialPaste)
        XCTAssertEqual(state.connectActionTitle, "Reconnect")
        XCTAssertFalse(state.showsDisconnectAction)
    }

    func testEmptyCredentialInputIsNotSavable() {
        let state = AppState(credentials: CredentialManager(store: InMemoryKeychainStore()))
        state.credentialInput = "   "
        XCTAssertFalse(state.canSaveCredential)
    }
}
