import XCTest
@testable import Mote

final class RelayConfigurationTests: XCTestCase {
    func testExplicitURLBuildsCanonicalPaths() throws {
        let configuration = RelayConfiguration(
            baseURL: try XCTUnwrap(URL(string: "https://relay.example.net"))
        )
        XCTAssertEqual(configuration.baseURL.absoluteString, "https://relay.example.net")
        XCTAssertEqual(configuration.webSocketURL.absoluteString, "wss://relay.example.net/v1/ws/device")
        XCTAssertEqual(configuration.hostDisplayName, "relay.example.net")
        XCTAssertEqual(
            configuration.pairRequestsURL.absoluteString,
            "https://relay.example.net/v1/pair/requests"
        )
        XCTAssertEqual(
            configuration.shortcutSetupURL(deviceID: "7B0F0000-0000-0000-0000-0000000091AC").absoluteString,
            "https://relay.example.net/s/7B0F0000-0000-0000-0000-0000000091AC"
        )
        XCTAssertEqual(
            configuration.pairWebSocketURL.absoluteString,
            "wss://relay.example.net/v1/ws/pair"
        )
        XCTAssertFalse(configuration.pairWebSocketURL.absoluteString.contains("pair_secret"))
    }

    func testHTTPOverrideBecomesWS() throws {
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:8787"))
        let configuration = RelayConfiguration(baseURL: url)
        XCTAssertEqual(configuration.webSocketURL.absoluteString, "ws://127.0.0.1:8787/v1/ws/device")
    }

    func testSettingsOverrideIsUsedWhenEnvironmentIsAbsent() throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment[RelayDefaults.environmentURLKey] != nil,
            "MOTE_RELAY_URL is set in the test environment"
        )
        let configuration = try XCTUnwrap(
            RelayConfiguration.resolve(settingsOverride: "https://relay.example.net")
        )
        XCTAssertEqual(configuration.baseURL.absoluteString, "https://relay.example.net")
        XCTAssertEqual(configuration.hostDisplayName, "relay.example.net")
        XCTAssertEqual(
            configuration.webSocketURL.absoluteString,
            "wss://relay.example.net/v1/ws/device"
        )
    }

    func testMissingOrInvalidURLFailsClosed() throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment[RelayDefaults.environmentURLKey] != nil,
            "MOTE_RELAY_URL is set in the test environment"
        )
        XCTAssertNil(RelayConfiguration.resolve())
        XCTAssertNil(RelayConfiguration.resolve(settingsOverride: "not-a-url"))
        XCTAssertNil(RelayConfiguration.resolve(settingsOverride: "   "))
        XCTAssertNil(RelayConfiguration.resolve(settingsOverride: "https://relay.example.com/extra path"))
    }

    func testParseBaseURLRequiresHTTPHost() {
        XCTAssertEqual(
            RelayConfiguration.parseBaseURL("https://relay.example.net")?.absoluteString,
            "https://relay.example.net"
        )
        XCTAssertEqual(
            RelayConfiguration.parseBaseURL("http://127.0.0.1:3000")?.absoluteString,
            "http://127.0.0.1:3000"
        )
        XCTAssertNil(RelayConfiguration.parseBaseURL("relay.example.com"))
        XCTAssertNil(RelayConfiguration.parseBaseURL("ftp://relay.example.com"))
        XCTAssertNil(RelayConfiguration.parseBaseURL("   "))
    }
}
