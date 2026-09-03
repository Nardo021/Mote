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
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw StoreError.unexpectedStatus(status)
        }
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
