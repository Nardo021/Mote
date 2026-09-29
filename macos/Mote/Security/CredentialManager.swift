import Foundation

actor CredentialManager {
    static let account = AppIdentity.keychainAccount

    private let store: any KeychainStoring
    private let legacyStore: (any KeychainStoring)?

    init(store: any KeychainStoring, legacyStore: (any KeychainStoring)? = nil) {
        self.store = store
        self.legacyStore = legacyStore
    }

    static func live() -> CredentialManager {
        CredentialManager(
            store: KeychainStore(service: AppIdentity.keychainService),
            legacyStore: KeychainStore(service: AppIdentity.legacyKeychainService)
        )
    }

    func load() throws -> String? {
        if let canonical = try readCredential(from: store) {
            return canonical
        }
        guard let legacyStore else {
            return nil
        }
        guard let legacy = try readCredential(from: legacyStore) else {
            return nil
        }
        return try migrateLegacyCredential(legacy, from: legacyStore)
    }

    func save(_ credential: String) throws {
        let trimmed = credential.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            try delete()
            return
        }
        guard let data = trimmed.data(using: .utf8) else {
            throw KeychainStore.StoreError.invalidItem
        }
        try store.save(data, account: Self.account)
        MoteLog.security.info("Device credential saved")
    }

    func delete() throws {
        try store.delete(account: Self.account)
        MoteLog.security.info("Device credential deleted")
    }

    func exists() -> Bool {
        store.exists(account: Self.account)
    }

    #if DEBUG
    func debugFallbackFromEnvironment() -> String? {
        guard let value = ProcessInfo.processInfo.environment[RelayDefaults.environmentCredentialKey] else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
    #endif

    /// One-way copy onto the canonical service. The legacy item is removed only
    /// after the new item reads back as the same credential. A failed write or
    /// a failed verify leaves the legacy item in place.
    private func migrateLegacyCredential(_ legacy: String, from legacyStore: any KeychainStoring) throws -> String {
        guard let data = legacy.data(using: .utf8) else {
            throw KeychainStore.StoreError.invalidItem
        }
        do {
            try store.save(data, account: Self.account)
        } catch {
            MoteLog.security.error("Credential migration save failed; legacy item kept")
            return legacy
        }

        let saved: String?
        do {
            saved = try readCredential(from: store)
        } catch {
            try? store.delete(account: Self.account)
            MoteLog.security.error("Credential migration verify failed; legacy item kept")
            return legacy
        }
        guard saved == legacy else {
            try? store.delete(account: Self.account)
            MoteLog.security.error("Credential migration verify failed; legacy item kept")
            return legacy
        }

        do {
            try legacyStore.delete(account: Self.account)
            MoteLog.security.info("Migrated device credential to canonical keychain identity")
        } catch {
            MoteLog.security.error("Credential migration copied but legacy delete failed")
        }
        return legacy
    }

    private func readCredential(from store: any KeychainStoring) throws -> String? {
        guard let data = try store.read(account: Self.account) else {
            return nil
        }
        guard let credential = String(data: data, encoding: .utf8) else {
            throw KeychainStore.StoreError.invalidItem
        }
        let trimmed = credential.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
