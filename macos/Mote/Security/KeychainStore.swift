import Foundation
import Security

protocol KeychainStoring: Sendable {
    func save(_ data: Data, account: String) throws
    func read(account: String) throws -> Data?
    func delete(account: String) throws
    func exists(account: String) -> Bool
}

struct KeychainStore: KeychainStoring, Sendable {
    var service: String = AppIdentity.keychainService

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
        tightenWorldReadableAccessIfNeeded(data: data, account: account)
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

    /// Default keychain ACL: the creating application can read this item.
    /// Do not grant decrypt access to arbitrary local applications.
    ///
    /// Ad-hoc ("Sign to Run Locally") binaries get a new cdhash every build, so
    /// a later ad-hoc rebuild may prompt. That prompt is preferable to a
    /// world-readable credential. A stable Development Team selected locally in
    /// Xcode keeps the same keychain access identity across rebuilds. The
    /// repository does not hard-code a Team ID.
    private func add(_ data: Data, account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrLabel as String: "Mote",
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw StoreError.unexpectedStatus(status)
        }
    }

    /// Older builds deliberately cleared the decrypt ACL so any local app could
    /// read the device credential. The next read by Mote replaces that item
    /// with a normal application-scoped item. The plaintext is not logged.
    private func tightenWorldReadableAccessIfNeeded(data: Data, account: String) {
        guard itemIsWorldReadable(account: account) else {
            return
        }
        try? save(data, account: account)
    }

    private func itemIsWorldReadable(account: String) -> Bool {
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
        return FileKeychainACL.isWorldReadable(unsafeBitCast(result, to: SecKeychainItem.self))
    }
}

enum FileKeychainACL {
    static func isWorldReadable(_ item: SecKeychainItem) -> Bool {
        var access: SecAccess?
        guard SecKeychainItemCopyAccess(item, &access) == errSecSuccess, let access else {
            return false
        }
        var aclList: CFArray?
        guard SecAccessCopyACLList(access, &aclList) == errSecSuccess, let acls = aclList as? [SecACL] else {
            return false
        }

        for acl in acls {
            let tags = authorizationTags(acl)
            guard tags.contains(kSecACLAuthorizationDecrypt as String) else {
                continue
            }
            var applications: CFArray?
            var description: CFString?
            var prompt: SecKeychainPromptSelector = []
            guard SecACLCopyContents(acl, &applications, &description, &prompt) == errSecSuccess else {
                continue
            }
            if applications == nil || CFArrayGetCount(applications) == 0 {
                return true
            }
        }
        return false
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
