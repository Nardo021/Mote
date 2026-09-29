import Foundation

/// Stable macOS identity for this repository.
///
/// GitHub owner is Nardo021 (`github.com/Nardo021/Mote`). The tree has no
/// separate product domain, so Bundle ID, Keychain service, and OSLog
/// subsystem share one reverse-DNS identifier. The previous placeholder
/// `com.example.mote` is legacy-only and is read during one-way migration.
enum AppIdentity {
    static let bundleID = "com.nardo021.mote"
    static let legacyBundleID = "com.example.mote"
    static let keychainService = bundleID
    static let legacyKeychainService = legacyBundleID
    static let keychainAccount = "device_connection"
    static let logSubsystem = bundleID
}
