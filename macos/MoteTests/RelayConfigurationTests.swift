import XCTest
@testable import Mote

final class RelayConfigurationTests: XCTestCase {
    func testProductionWebSocketURL() {
        let configuration = RelayConfiguration.production
        XCTAssertEqual(configuration.baseURL.absoluteString, "https://relay.yanze.me")
        XCTAssertEqual(configuration.webSocketURL.absoluteString, "wss://relay.yanze.me/v1/ws/device")
        XCTAssertEqual(configuration.hostDisplayName, "relay.yanze.me")
        XCTAssertEqual(
            configuration.pairRequestsURL.absoluteString,
            "https://relay.yanze.me/v1/pair/requests"
        )
        XCTAssertEqual(
            configuration.shortcutSetupURL(deviceID: "7B0F0000-0000-0000-0000-0000000091AC").absoluteString,
            "https://relay.yanze.me/s/7B0F0000-0000-0000-0000-0000000091AC"
        )
        XCTAssertTrue(
            configuration.pairWebSocketURL(requestID: "req", pairSecret: "sec")
                .absoluteString
                .hasPrefix("wss://relay.yanze.me/v1/ws/pair?")
        )
    }

    func testHTTPOverrideBecomesWS() throws {
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:8787"))
        let configuration = RelayConfiguration(baseURL: url)
        XCTAssertEqual(configuration.webSocketURL.absoluteString, "ws://127.0.0.1:8787/v1/ws/device")
    }
}
