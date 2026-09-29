import Foundation

final class SettingsStore: @unchecked Sendable {
    private enum Keys {
        static let deviceID = "device_id"
        static let deviceName = "device_name"
        static let wantsConnection = "wants_connection"
        static let relayURLOverride = "relay_url_override"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard, legacyValues: [String: Any]? = nil) {
        self.defaults = defaults
        if let legacyValues {
            applyLegacy(legacyValues)
        } else if !RuntimeContext.isRunningTests, defaults === UserDefaults.standard {
            let legacy = UserDefaults.standard.persistentDomain(forName: AppIdentity.legacyBundleID) ?? [:]
            applyLegacy(legacy)
        }
    }

    private func applyLegacy(_ legacy: [String: Any]) {
        var current: [String: Any] = [:]
        for key in PreferenceMigration.keys {
            if let value = defaults.object(forKey: key) {
                current[key] = value
            }
        }
        let copied = PreferenceMigration.valuesToCopy(current: current, legacy: legacy)
        guard !copied.isEmpty else { return }
        for (key, value) in copied {
            defaults.set(value, forKey: key)
        }
        MoteLog.app.info("Copied legacy device preferences")
    }

    func load() -> AppSettings {
        AppSettings(
            deviceID: persistedDeviceID(),
            deviceName: persistedDeviceName(),
            wantsConnection: defaults.object(forKey: Keys.wantsConnection) as? Bool ?? true,
            relayURLOverride: defaults.string(forKey: Keys.relayURLOverride)
        )
    }

    func saveDeviceName(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        defaults.set(trimmed.isEmpty ? SystemDeviceName.current() : trimmed, forKey: Keys.deviceName)
    }

    func saveWantsConnection(_ wantsConnection: Bool) {
        defaults.set(wantsConnection, forKey: Keys.wantsConnection)
    }

    func saveRelayURLOverride(_ override: String?) {
        let trimmed = override?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty {
            defaults.removeObject(forKey: Keys.relayURLOverride)
        } else {
            defaults.set(trimmed, forKey: Keys.relayURLOverride)
        }
    }

    private func persistedDeviceID() -> String {
        if let existing = defaults.string(forKey: Keys.deviceID), !existing.isEmpty {
            return existing
        }
        let generated = UUID().uuidString
        defaults.set(generated, forKey: Keys.deviceID)
        MoteLog.app.info("Generated persistent device ID")
        return generated
    }

    private func persistedDeviceName() -> String {
        if let existing = defaults.string(forKey: Keys.deviceName), !existing.isEmpty {
            return existing
        }
        let name = SystemDeviceName.current()
        defaults.set(name, forKey: Keys.deviceName)
        return name
    }
}
