import XCTest
@testable import Mote

final class CommandResultEncodingTests: XCTestCase {
    func testEncodesCompletedResult() throws {
        let result = MoteCommandResult.status(
            .completed,
            commandID: "cmd_1",
            completedAt: 1234
        )
        let data = try ProtocolJSON.encode(result)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["type"] as? String, "command_result")
        XCTAssertEqual(object?["version"] as? Int, 1)
        XCTAssertEqual(object?["command_id"] as? String, "cmd_1")
        XCTAssertEqual(object?["status"] as? String, "completed")
        XCTAssertEqual(object?["completed_at"] as? Int, 1234)
    }

    func testEncodesPermissionRequired() throws {
        let result = MoteCommandResult.status(.permissionRequired, commandID: "cmd_2", completedAt: 1)
        let data = try ProtocolJSON.encode(result)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["status"] as? String, "permission_required")
    }
}
