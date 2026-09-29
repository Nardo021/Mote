import XCTest
@testable import Mote

final class PreferenceMigrationTests: XCTestCase {
    func testValuesToCopySkipsKeysThatAlreadyExist() {
        let copied = PreferenceMigration.valuesToCopy(
            current: [PreferenceMigration.deviceID: "current-id"],
            legacy: [
                PreferenceMigration.deviceID: "legacy-id",
                PreferenceMigration.deviceName: "Desk",
                PreferenceMigration.wantsConnection: false,
                PreferenceMigration.relayURLOverride: "https://relay.example.net"
            ]
        )
        XCTAssertNil(copied[PreferenceMigration.deviceID])
        XCTAssertEqual(copied[PreferenceMigration.deviceName] as? String, "Desk")
        XCTAssertEqual(copied[PreferenceMigration.wantsConnection] as? Bool, false)
        XCTAssertEqual(copied[PreferenceMigration.relayURLOverride] as? String, "https://relay.example.net")
    }

    func testLegacyPreferencesPreserveDeviceID() {
        let suite = "mote.tests.prefs.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }

        let store = SettingsStore(
            defaults: defaults,
            legacyValues: [
                PreferenceMigration.deviceID: "7B0F0000-0000-0000-0000-0000000091AC",
                PreferenceMigration.deviceName: "Desk",
                PreferenceMigration.wantsConnection: false,
                PreferenceMigration.relayURLOverride: "https://relay.example.net"
            ]
        )
        let loaded = store.load()
        XCTAssertEqual(loaded.deviceID, "7B0F0000-0000-0000-0000-0000000091AC")
        XCTAssertEqual(loaded.deviceName, "Desk")
        XCTAssertFalse(loaded.wantsConnection)
        XCTAssertEqual(loaded.relayURLOverride, "https://relay.example.net")
        XCTAssertEqual(store.load().deviceID, loaded.deviceID)
    }

    func testExistingDeviceIDWinsOverLegacy() {
        let suite = "mote.tests.prefs.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("current-id", forKey: PreferenceMigration.deviceID)

        let store = SettingsStore(
            defaults: defaults,
            legacyValues: [PreferenceMigration.deviceID: "legacy-id"]
        )
        XCTAssertEqual(store.load().deviceID, "current-id")
    }
}
