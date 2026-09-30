import Darwin
import Security
import XCTest
@testable import Mote

final class KeychainStoreTests: XCTestCase {
    func testInMemorySaveReadDeleteExists() throws {
        let store = InMemoryKeychainStore()
        XCTAssertFalse(store.exists(account: CredentialManager.account))

        try store.save(Data("secret".utf8), account: CredentialManager.account)
        XCTAssertTrue(store.exists(account: CredentialManager.account))
        XCTAssertEqual(try store.read(account: CredentialManager.account), Data("secret".utf8))

        try store.delete(account: CredentialManager.account)
        XCTAssertFalse(store.exists(account: CredentialManager.account))
        XCTAssertNil(try store.read(account: CredentialManager.account))
    }

    func testCredentialManagerRoundTrip() async throws {
        let manager = CredentialManager(store: InMemoryKeychainStore())
        let missing = await manager.exists()
        XCTAssertFalse(missing)
        try await manager.save("  device-credential  ")
        let loaded = try await manager.load()
        XCTAssertEqual(loaded, "device-credential")
        try await manager.delete()
        let afterDelete = try await manager.load()
        XCTAssertNil(afterDelete)
    }

    func testCanonicalServiceMatchesBundleIdentity() {
        XCTAssertEqual(KeychainStore().service, AppIdentity.keychainService)
        XCTAssertEqual(AppIdentity.keychainService, AppIdentity.bundleID)
        XCTAssertEqual(AppIdentity.bundleID, "com.nardo021.mote")
        XCTAssertNotEqual(AppIdentity.keychainService, AppIdentity.legacyBundleID)
    }

    func testIsolatedServiceSaveReadRotateDelete() throws {
        let service = "com.nardo021.mote.test.\(UUID().uuidString)"
        let account = "device_connection"
        let store = KeychainStore(service: service)
        defer { try? store.delete(account: account) }

        try store.save(Data("secret".utf8), account: account)
        XCTAssertEqual(try store.read(account: account), Data("secret".utf8))
        try store.save(Data("rotated".utf8), account: account)
        XCTAssertEqual(try store.read(account: account), Data("rotated".utf8))
        try store.delete(account: account)
        XCTAssertNil(try store.read(account: account))
    }

    func testNewItemIsNotWorldReadableWhenACLIsQueryable() throws {
        let service = "com.nardo021.mote.test.\(UUID().uuidString)"
        let account = "device_connection"
        let store = KeychainStore(service: service)
        defer { try? store.delete(account: account) }
        try store.save(Data("secret".utf8), account: account)

        switch inspectDecryptACL(service: service, account: account) {
        case .unavailable:
            throw XCTSkip("ACL-specific test skipped: this runner could not query the keychain item ACL.")
        case .worldReadable:
            XCTFail("A newly saved item must not be world-readable.")
        case .applicationScoped:
            break
        }
    }

    func testReadRewritesLegacyWorldReadableACL() throws {
        // A world-readable fixture is created by rewriting a decrypt ACL. On a
        // headless runner that panel never returns, so refuse UI and skip if
        // Security.framework will not build the fixture without it.
        guard SecKeychainSetUserInteractionAllowed(false) == errSecSuccess else {
            throw XCTSkip("ACL-specific test skipped: this runner could not disable keychain user interaction, so the legacy ACL fixture could hang.")
        }
        let service = "com.nardo021.mote.test.\(UUID().uuidString)"
        let account = "device_connection"
        defer {
            SecItemDelete([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account
            ] as CFDictionary)
        }
        switch installLegacyWorldReadableItem(service: service, account: account, data: Data("legacy".utf8)) {
        case .created:
            break
        case .failed:
            throw XCTSkip("ACL-specific test skipped: this runner's Security.framework did not permit a legacy world-readable fixture.")
        case .timedOut:
            throw XCTSkip("ACL-specific test skipped: building the legacy world-readable fixture blocked inside Security.framework and was stopped before it could hang the test runner.")
        case .probeFailed:
            XCTFail("The legacy ACL fixture probe could not be compiled.")
        }
        guard case .worldReadable = inspectDecryptACL(service: service, account: account) else {
            throw XCTSkip("ACL-specific test skipped: the legacy fixture could not be confirmed world-readable on this runner.")
        }

        let store = KeychainStore(service: service)
        XCTAssertEqual(try store.read(account: account), Data("legacy".utf8))
        switch inspectDecryptACL(service: service, account: account) {
        case .applicationScoped:
            break
        case .worldReadable:
            XCTFail("Reading a relaxed item should replace it with an application-scoped item.")
        case .unavailable:
            throw XCTSkip("ACL-specific test skipped: ACL inspection became unavailable after the rewrite.")
        }
        XCTAssertEqual(try store.read(account: account), Data("legacy".utf8))
    }
}

private enum DecryptACL {
    case applicationScoped
    case worldReadable
    case unavailable
}

private func inspectDecryptACL(service: String, account: String) -> DecryptACL {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnRef as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let result else {
        return .unavailable
    }
    let item = unsafeBitCast(result, to: SecKeychainItem.self)
    var access: SecAccess?
    guard SecKeychainItemCopyAccess(item, &access) == errSecSuccess, let access else {
        return .unavailable
    }
    var aclList: CFArray?
    guard SecAccessCopyACLList(access, &aclList) == errSecSuccess, aclList != nil else {
        return .unavailable
    }
    if FileKeychainACL.isWorldReadable(item) {
        return .worldReadable
    }
    return .applicationScoped
}

private enum LegacyACLFixture {
    case created
    case failed
    case timedOut
    case probeFailed
}

/// Builds the legacy ACL in a child process. GitHub's macOS runner blocks forever
/// inside these Security calls, and that blocked thread cannot be abandoned in-process.
private func installLegacyWorldReadableItem(service: String, account: String, data: Data) -> LegacyACLFixture {
    let directory = FileManager.default.temporaryDirectory
    let binary = directory.appendingPathComponent("mote-acl-fixture-\(UUID().uuidString)")
    let sourceURL = binary.appendingPathExtension("swift")
    defer {
        try? FileManager.default.removeItem(at: sourceURL)
        try? FileManager.default.removeItem(at: binary)
    }
    do {
        try legacyACLFixtureSource.write(to: sourceURL, atomically: true, encoding: .utf8)
        let compiler = Process()
        compiler.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
        compiler.arguments = ["swiftc", "-O", "-o", binary.path, sourceURL.path, "-framework", "Security"]
        compiler.standardOutput = FileHandle.nullDevice
        compiler.standardError = FileHandle.nullDevice
        try compiler.run()
        compiler.waitUntilExit()
        guard compiler.terminationStatus == 0 else {
            return .probeFailed
        }

        let runner = Process()
        runner.executableURL = binary
        runner.arguments = [service, account, data.base64EncodedString()]
        let output = Pipe()
        runner.standardOutput = output
        runner.standardError = FileHandle.nullDevice
        try runner.run()
        let deadline = Date().addingTimeInterval(8)
        while runner.isRunning, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if runner.isRunning {
            runner.terminate()
            Thread.sleep(forTimeInterval: 0.2)
            if runner.isRunning {
                kill(runner.processIdentifier, SIGKILL)
            }
            return .timedOut
        }
        let text = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return text.contains("created") ? .created : .failed
    } catch {
        return .probeFailed
    }
}

private let legacyACLFixtureSource = """
import Foundation
import Security

let arguments = CommandLine.arguments
guard arguments.count == 4, let data = Data(base64Encoded: arguments[3]) else {
    fputs("failed\\n", stdout)
    exit(1)
}
_ = SecKeychainSetUserInteractionAllowed(false)
var access: SecAccess?
guard SecAccessCreate("Mote device credential" as CFString, nil, &access) == errSecSuccess, let access else {
    fputs("failed\\n", stdout)
    exit(0)
}
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: arguments[1],
    kSecAttrAccount as String: arguments[2],
    kSecValueData as String: data,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    kSecAttrAccess as String: access,
    kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail
]
guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
    fputs("failed\\n", stdout)
    exit(0)
}
let lookup: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: arguments[1],
    kSecAttrAccount as String: arguments[2],
    kSecReturnRef as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
    kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail
]
var result: CFTypeRef?
guard SecItemCopyMatching(lookup as CFDictionary, &result) == errSecSuccess, let result else {
    fputs("failed\\n", stdout)
    exit(0)
}
let item = unsafeBitCast(result, to: SecKeychainItem.self)
var copied: SecAccess?
guard SecKeychainItemCopyAccess(item, &copied) == errSecSuccess, let copied else {
    fputs("failed\\n", stdout)
    exit(0)
}
var aclList: CFArray?
guard SecAccessCopyACLList(copied, &aclList) == errSecSuccess, let acls = aclList as? [SecACL] else {
    fputs("failed\\n", stdout)
    exit(0)
}
var updated = false
for acl in acls {
    let tags = Set((SecACLCopyAuthorizations(acl) as? [Any] ?? []).map { String(describing: $0) })
    guard tags.contains(kSecACLAuthorizationDecrypt as String) else {
        continue
    }
    var applications: CFArray?
    var description: CFString?
    var prompt: SecKeychainPromptSelector = []
    guard SecACLCopyContents(acl, &applications, &description, &prompt) == errSecSuccess else {
        fputs("failed\\n", stdout)
        exit(0)
    }
    let label = (description as String?) ?? "Mote device credential"
    guard SecACLSetContents(acl, nil, label as CFString, prompt) == errSecSuccess else {
        fputs("failed\\n", stdout)
        exit(0)
    }
    updated = true
}
guard updated, SecKeychainItemSetAccess(item, copied) == errSecSuccess else {
    fputs("failed\\n", stdout)
    exit(0)
}
fputs("created\\n", stdout)
fflush(stdout)
"""
