import Foundation

enum PreferenceMigration {
    static let deviceID = "device_id"
    static let deviceName = "device_name"
    static let wantsConnection = "wants_connection"
    static let relayURLOverride = "relay_url_override"
    static let keys = [deviceID, deviceName, wantsConnection, relayURLOverride]

    /// Copies only missing keys. Present values, including a newer device id, win.
    static func valuesToCopy(current: [String: Any], legacy: [String: Any]) -> [String: Any] {
        var copy: [String: Any] = [:]
        for key in keys where current[key] == nil {
            if let value = legacy[key] {
                copy[key] = value
            }
        }
        return copy
    }
}
