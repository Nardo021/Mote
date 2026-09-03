import Foundation
import Security

protocol KeychainStoring: Sendable {
    func save(_ data: Data, account: String) throws
    func read(account: String) throws -> Data?
    func delete(account: String) throws
    func exists(account: String) -> Bool
}

struct KeychainStore: KeychainStoring, Sendable {
    var service: String = "me.yanze.mote"

    enum StoreError: Error, Equatable {
        case unexpectedStatus(OSStatus)
        case invalidItem
    }

    func save(_ data: Data, account: String) throws {
        try delete(account: account)
        try add(data, account: account)
    }

    func read(account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw StoreError.unexpectedStatus(status)
        }
        guard let data = result as? Data else {
            throw StoreError.invalidItem
        }
        rewriteSharedAccessIfNeeded(data: data, account: account)
        return data
    }

    func delete(account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            return
        }
        throw StoreError.unexpectedStatus(status)
    }

    func exists(account: String) -> Bool {
        do {
            return try read(account: account) != nil
        } catch {
            return false
        }
    }

    /// Ad-hoc ("Sign to Run Locally") binaries have a new cdhash every build.
    /// The default decrypt ACL is bound to that hash, so Always Allow never
    /// survives the next process. After adding the item we drop the
    /// creating-app decrypt restriction. The cdhash partition stays, so a
    /// later rebuild may prompt once; the same installed binary will not.
    private func add(_ data: Data, account: String) throws {
        let access = try FileKeychainACL.makeSharedAccess()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrLabel as String: "Mote",
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecAttrAccess as String: access,
            kSecReturnRef as String: true
        ]
        var result: AnyObject?
        let status = SecItemAdd(query as CFDictionary, &result)
        guard status == errSecSuccess else {
            throw StoreError.unexpectedStatus(status)
        }
        if let result {
            _ = FileKeychainACL.relax(unsafeBitCast(result, to: SecKeychainItem.self))
        }
    }

    private func rewriteSharedAccessIfNeeded(data: Data, account: String) {
        guard !itemHasSharedAccess(account: account) else {
            return
        }
        try? save(data, account: account)
    }

    private func itemHasSharedAccess(account: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnRef as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let result else {
            return true
        }
        return FileKeychainACL.isShared(unsafeBitCast(result, to: SecKeychainItem.self))
    }
}

enum FileKeychainACL {
    static func makeSharedAccess() throws -> SecAccess {
        var access: SecAccess?
        let status = SecAccessCreate("Mote device credential" as CFString, nil, &access)
        guard status == errSecSuccess, let access else {
            throw KeychainStore.StoreError.unexpectedStatus(status)
        }
        return access
    }

    static func relax(_ item: SecKeychainItem) -> OSStatus {
        var access: SecAccess?
        let copyStatus = SecKeychainItemCopyAccess(item, &access)
        guard copyStatus == errSecSuccess, let access else {
            return copyStatus
        }
        var aclList: CFArray?
        guard SecAccessCopyACLList(access, &aclList) == errSecSuccess, let acls = aclList as? [SecACL] else {
            return errSecSuccess
        }

        for acl in acls {
            let tags = authorizationTags(acl)
            var applications: CFArray?
            var description: CFString?
            var prompt: SecKeychainPromptSelector = []
            _ = SecACLCopyContents(acl, &applications, &description, &prompt)
            let label = (description as String?) ?? "Mote device credential"

            if tags.contains(kSecACLAuthorizationDecrypt as String) {
                _ = SecACLSetContents(acl, nil, label as CFString, prompt)
            }
        }
        return SecKeychainItemSetAccess(item, access)
    }

    static func isShared(_ item: SecKeychainItem) -> Bool {
        var access: SecAccess?
        guard SecKeychainItemCopyAccess(item, &access) == errSecSuccess, let access else {
            return true
        }
        var aclList: CFArray?
        guard SecAccessCopyACLList(access, &aclList) == errSecSuccess, let acls = aclList as? [SecACL] else {
            return true
        }

        for acl in acls {
            let tags = authorizationTags(acl)
            var applications: CFArray?
            var description: CFString?
            var prompt: SecKeychainPromptSelector = []
            guard SecACLCopyContents(acl, &applications, &description, &prompt) == errSecSuccess else {
                continue
            }
            if tags.contains(kSecACLAuthorizationDecrypt as String),
               let applications,
               CFArrayGetCount(applications) > 0
            {
                return false
            }
        }
        return true
    }

    private static func authorizationTags(_ acl: SecACL) -> Set<String> {
        let values = SecACLCopyAuthorizations(acl) as? [Any] ?? []
        return Set(values.map { String(describing: $0) })
    }
}

final class InMemoryKeychainStore: KeychainStoring, @unchecked Sendable {
    private var items: [String: Data] = [:]
    private let lock = NSLock()

    func save(_ data: Data, account: String) throws {
        lock.lock()
        items[account] = data
        lock.unlock()
    }

    func read(account: String) throws -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return items[account]
    }

    func delete(account: String) throws {
        lock.lock()
        items.removeValue(forKey: account)
        lock.unlock()
    }

    func exists(account: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return items[account] != nil
    }
}
