import XCTest
@testable import Mote

final class KeychainStoreTests: XCTestCase {
    func testInMemorySaveReadDeleteExists() throws {
        let store = InMemoryKeychainStore()
        XCTAssertFalse(store.exists(account: CredentialManager.account))

        try store.save(Data("secret".utf8), account: CredentialManager.account)
        XCTAssertTrue(store.exists(account: CredentialManager.account))
        XCTAssertEqual(try store.read(account: CredentialManager.account), Data("secret".utf8))

        try store.delete(account: CredentialManager.account)
        XCTAssertFalse(store.exists(account: CredentialManager.account))
        XCTAssertNil(try store.read(account: CredentialManager.account))
    }

    func testCredentialManagerRoundTrip() async throws {
        let manager = CredentialManager(store: InMemoryKeychainStore())
        let missing = await manager.exists()
        XCTAssertFalse(missing)
        try await manager.save("  device-credential  ")
        let loaded = try await manager.load()
        XCTAssertEqual(loaded, "device-credential")
        try await manager.delete()
        let afterDelete = try await manager.load()
        XCTAssertNil(afterDelete)
    }
}
