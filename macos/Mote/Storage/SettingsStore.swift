import Foundation

final class SettingsStore: @unchecked Sendable {
    private enum Keys {
        static let deviceID = "device_id"
        static let deviceName = "device_name"
        static let wantsConnection = "wants_connection"
        static let relayURLOverride = "relay_url_override"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
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
