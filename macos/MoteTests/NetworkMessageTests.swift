import XCTest
@testable import Mote

final class NetworkMessageTests: XCTestCase {
    func testAuthMessageUsesSnakeCaseKeys() throws {
        let message = AuthMessage(
            deviceID: "device-1",
            credential: "not-logged",
            appVersion: "1.0.0 (1)"
        )
        let data = try ProtocolJSON.encode(message)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["type"] as? String, "auth")
        XCTAssertEqual(object?["device_id"] as? String, "device-1")
        XCTAssertEqual(object?["credential"] as? String, "not-logged")
        XCTAssertEqual(object?["version"] as? Int, 1)
        XCTAssertEqual(object?["app_version"] as? String, "1.0.0 (1)")
    }

    func testHeartbeatAndAck() throws {
        let heartbeat = HeartbeatMessage(deviceID: "device-1", sentAt: 50)
        let encoded = try ProtocolJSON.encode(heartbeat)
        let object = try JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        XCTAssertEqual(object?["type"] as? String, "heartbeat")
        XCTAssertEqual(object?["sent_at"] as? Int, 50)

        let ackJSON = """
        {"type":"heartbeat_ack","version":1,"sent_at":50,"server_at":60}
        """.data(using: .utf8) ?? Data()
        let decoded = try IncomingRelayMessage.decode(from: ackJSON)
        guard case .heartbeatAck(let ack) = decoded else {
            return XCTFail("Expected heartbeat ack")
        }
        XCTAssertEqual(ack.sentAt, 50)
        XCTAssertEqual(ack.serverAt, 60)
    }

    func testAuthResultSuccessAndError() throws {
        let ok = """
        {"type":"auth_result","version":1,"status":"ok"}
        """.data(using: .utf8) ?? Data()
        let okMessage = try IncomingRelayMessage.decode(from: ok)
        guard case .authResult(let result) = okMessage else {
            return XCTFail("Expected auth result")
        }
        XCTAssertTrue(result.isSuccessful)

        let error = """
        {"type":"auth_result","version":1,"status":"error","error":"invalid_credentials"}
        """.data(using: .utf8) ?? Data()
        let errorMessage = try IncomingRelayMessage.decode(from: error)
        guard case .authResult(let failed) = errorMessage else {
            return XCTFail("Expected auth result")
        }
        XCTAssertFalse(failed.isSuccessful)
        XCTAssertEqual(failed.error, "invalid_credentials")
    }

    func testMalformedJSONDoesNotDecode() {
        let data = Data("not-json".utf8)
        XCTAssertThrowsError(try IncomingRelayMessage.decode(from: data))
    }
}
