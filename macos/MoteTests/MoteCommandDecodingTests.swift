import XCTest
@testable import Mote

final class MoteCommandDecodingTests: XCTestCase {
    func testDecodesLockCommand() throws {
        let json = """
        {
          "type": "command",
          "version": 1,
          "id": "cmd_1",
          "device_id": "device-1",
          "action": "lock",
          "created_at": 1000,
          "expires_at": 11000,
          "nonce": "n1"
        }
        """.data(using: .utf8) ?? Data()

        let command = try JSONDecoder().decode(MoteCommand.self, from: json)
        XCTAssertEqual(command.id, "cmd_1")
        XCTAssertEqual(command.deviceID, "device-1")
        XCTAssertEqual(command.parsedAction, .lock)
        XCTAssertEqual(command.createdAt, 1000)
        XCTAssertEqual(command.expiresAt, 11000)
    }

    func testUnknownActionRemainsRawAndDoesNotMap() throws {
        let json = """
        {
          "type": "command",
          "version": 1,
          "id": "cmd_2",
          "device_id": "device-1",
          "action": "rm -rf /",
          "created_at": 1000,
          "expires_at": 11000,
          "nonce": "n2"
        }
        """.data(using: .utf8) ?? Data()

        let command = try JSONDecoder().decode(MoteCommand.self, from: json)
        XCTAssertEqual(command.action, "rm -rf /")
        XCTAssertNil(command.parsedAction)
    }

    func testIncomingMessageDecodesCommandEnvelope() throws {
        let json = """
        {
          "type": "command",
          "version": 1,
          "id": "cmd_3",
          "device_id": "device-1",
          "action": "lock",
          "created_at": 1,
          "expires_at": 2,
          "nonce": "n3"
        }
        """.data(using: .utf8) ?? Data()

        let message = try IncomingRelayMessage.decode(from: json)
        guard case .command(let command) = message else {
            return XCTFail("Expected command message")
        }
        XCTAssertEqual(command.id, "cmd_3")
    }
}
