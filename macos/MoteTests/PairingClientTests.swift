import XCTest
@testable import Mote

final class PairingClientTests: XCTestCase {
    func testWaitForDecisionSendsPairAuthOnASecretFreeURL() async throws {
        let configuration = RelayConfiguration(
            baseURL: try XCTUnwrap(URL(string: "https://relay.example.com"))
        )
        let transport = MockRelayTransport()
        let captured = CapturedURL()
        let client = RelayPairingClient { url in
            captured.value = url
            return transport
        }
        let task = Task {
            try await client.waitForDecision(
                configuration: configuration,
                requestID: "req-1",
                pairSecret: "secret-1"
            )
        }

        var sent: [Data] = []
        for _ in 0..<50 {
            sent = await transport.sentMessages()
            if !sent.isEmpty {
                break
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }

        let url = try XCTUnwrap(captured.value)
        XCTAssertEqual(url.absoluteString, "wss://relay.example.com/v1/ws/pair")
        XCTAssertFalse(url.absoluteString.contains("pair_secret"))
        let frame = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try XCTUnwrap(sent.first)) as? [String: Any]
        )
        XCTAssertEqual(frame["type"] as? String, "pair_auth")
        XCTAssertEqual(frame["version"] as? Int, 1)
        XCTAssertEqual(frame["request_id"] as? String, "req-1")
        XCTAssertEqual(frame["pair_secret"] as? String, "secret-1")

        let approved: [String: Any] = [
            "type": "pair_approved",
            "version": 1,
            "device_id": "device-1",
            "credential": "cred",
            "name": "Mac"
        ]
        await transport.enqueueIncoming(try JSONSerialization.data(withJSONObject: approved))
        let decision = try await task.value
        guard case .approved(let deviceID, let credential, let name) = decision else {
            XCTFail("Expected an approved pairing decision")
            return
        }
        XCTAssertEqual(deviceID, "device-1")
        XCTAssertEqual(credential, "cred")
        XCTAssertEqual(name, "Mac")
    }
}

private final class CapturedURL: @unchecked Sendable {
    var value: URL?
}
