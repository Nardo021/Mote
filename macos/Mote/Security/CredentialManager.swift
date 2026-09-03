import Foundation

actor CredentialManager {
    static let account = "device_connection"

    private let store: any KeychainStoring

    init(store: any KeychainStoring = KeychainStore()) {
        self.store = store
    }

    func load() throws -> String? {
        guard let data = try store.read(account: Self.account) else {
            return nil
        }
        guard let credential = String(data: data, encoding: .utf8) else {
            throw KeychainStore.StoreError.invalidItem
        }
        let trimmed = credential.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
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
}
