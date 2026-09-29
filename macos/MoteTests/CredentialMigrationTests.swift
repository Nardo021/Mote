import XCTest
@testable import Mote

final class CredentialMigrationTests: XCTestCase {
    func testCanonicalCredentialWinsAndLegacyItemStays() async throws {
        let canonical = InMemoryKeychainStore()
        let legacy = InMemoryKeychainStore()
        try canonical.save(Data("current-secret".utf8), account: CredentialManager.account)
        try legacy.save(Data("legacy-secret".utf8), account: CredentialManager.account)
        let manager = CredentialManager(store: canonical, legacyStore: legacy)

        let loaded = try await manager.load()
        XCTAssertEqual(loaded, "current-secret")
        XCTAssertEqual(try legacy.read(account: CredentialManager.account), Data("legacy-secret".utf8))
    }

    func testLegacyCredentialMovesOnlyAfterVerifiedWrite() async throws {
        let canonical = InMemoryKeychainStore()
        let legacy = InMemoryKeychainStore()
        try legacy.save(Data("legacy-secret".utf8), account: CredentialManager.account)
        let manager = CredentialManager(store: canonical, legacyStore: legacy)

        let loaded = try await manager.load()
        XCTAssertEqual(loaded, "legacy-secret")
        XCTAssertEqual(try canonical.read(account: CredentialManager.account), Data("legacy-secret".utf8))
        XCTAssertNil(try legacy.read(account: CredentialManager.account))
    }

    func testFailedCanonicalWriteKeepsLegacyCredential() async throws {
        let canonical = ThrowingKeychainStore()
        let legacy = InMemoryKeychainStore()
        try legacy.save(Data("legacy-secret".utf8), account: CredentialManager.account)
        let manager = CredentialManager(store: canonical, legacyStore: legacy)

        let loaded = try await manager.load()
        XCTAssertEqual(loaded, "legacy-secret")
        XCTAssertEqual(try legacy.read(account: CredentialManager.account), Data("legacy-secret".utf8))
        XCTAssertNil(try canonical.read(account: CredentialManager.account))
    }

    func testFailedVerifyDeletesPartialItemAndKeepsLegacy() async throws {
        let canonical = CorruptWriteKeychainStore()
        let legacy = InMemoryKeychainStore()
        try legacy.save(Data("legacy-secret".utf8), account: CredentialManager.account)
        let manager = CredentialManager(store: canonical, legacyStore: legacy)

        let loaded = try await manager.load()
        XCTAssertEqual(loaded, "legacy-secret")
        XCTAssertNil(try canonical.read(account: CredentialManager.account))
        XCTAssertEqual(try legacy.read(account: CredentialManager.account), Data("legacy-secret".utf8))
    }
}

private final class ThrowingKeychainStore: KeychainStoring, @unchecked Sendable {
    private let inner = InMemoryKeychainStore()

    func save(_ data: Data, account: String) throws {
        throw KeychainStore.StoreError.invalidItem
    }

    func read(account: String) throws -> Data? {
        try inner.read(account: account)
    }

    func delete(account: String) throws {
        try inner.delete(account: account)
    }

    func exists(account: String) -> Bool {
        inner.exists(account: account)
    }
}

private final class CorruptWriteKeychainStore: KeychainStoring, @unchecked Sendable {
    private var item: Data?

    func save(_ data: Data, account: String) throws {
        item = Data("corrupt".utf8)
    }

    func read(account: String) throws -> Data? {
        item
    }

    func delete(account: String) throws {
        item = nil
    }

    func exists(account: String) -> Bool {
        item != nil
    }
}
