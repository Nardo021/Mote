import Security
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

    func testSaveUsesSharedAccessSoLaterLaunchesDoNotNeedAPrompt() throws {
        let service = "me.yanze.mote.test.\(UUID().uuidString)"
        let account = "device_connection"
        let store = KeychainStore(service: service)
        try store.save(Data("secret".utf8), account: account)
        defer { try? store.delete(account: account) }

        XCTAssertTrue(
            keychainItemHasSharedAccess(service: service, account: account),
            "Ad-hoc builds cannot persist Always Allow; the item must allow any local app.\n\(keychainACLDump(service: service, account: account))"
        )
        XCTAssertEqual(try store.read(account: account), Data("secret".utf8))
    }

    func testReadRewritesLegacyACLToSharedAccess() throws {
        let service = "me.yanze.mote.test.\(UUID().uuidString)"
        let account = "device_connection"
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data("legacy".utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        XCTAssertEqual(SecItemAdd(add as CFDictionary, nil), errSecSuccess)
        defer {
            SecItemDelete([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account
            ] as CFDictionary)
        }

        XCTAssertFalse(
            keychainItemHasSharedAccess(service: service, account: account),
            "The legacy item should still be restricted to the creating app."
        )

        let store = KeychainStore(service: service)
        XCTAssertEqual(try store.read(account: account), Data("legacy".utf8))
        XCTAssertTrue(
            keychainItemHasSharedAccess(service: service, account: account),
            "Reading a legacy item should rewrite it so the next launch does not prompt."
        )
    }
}

private func keychainItemHasSharedAccess(service: String, account: String) -> Bool {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnRef as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let result else {
        return false
    }
    return FileKeychainACL.isShared(unsafeBitCast(result, to: SecKeychainItem.self))
}

private func keychainACLDump(service: String, account: String) -> String {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnRef as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let result else {
        return "missing item"
    }
    let item = unsafeBitCast(result, to: SecKeychainItem.self)
    var access: SecAccess?
    guard SecKeychainItemCopyAccess(item, &access) == errSecSuccess, let access else {
        return "no access"
    }
    var aclList: CFArray?
    guard SecAccessCopyACLList(access, &aclList) == errSecSuccess, let acls = aclList as? [SecACL] else {
        return "no acls"
    }

    var lines: [String] = []
    for (index, acl) in acls.enumerated() {
        var applications: CFArray?
        var description: CFString?
        var prompt: SecKeychainPromptSelector = []
        _ = SecACLCopyContents(acl, &applications, &description, &prompt)
        let auths = (SecACLCopyAuthorizations(acl) as? [Any] ?? []).map { String(describing: $0) }
        let appCount = applications.map { CFArrayGetCount($0) } ?? -1
        lines.append("acl[\(index)] apps=\(appCount) prompt=\(prompt.rawValue) auths=\(auths) desc=\(description as String? ?? "nil")")
    }
    return lines.joined(separator: "\n")
}
