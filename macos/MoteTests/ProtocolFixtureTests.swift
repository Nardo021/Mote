import XCTest
@testable import Mote

/// Xcode compiles `macos/MoteTests` as a synchronized group and does not bundle `protocol/`.
/// These tests read the canonical fixtures from the repository path of this source file.
/// That works for a local or CI build of this repo. It is not a copied JSON snapshot.
final class ProtocolFixtureTests: XCTestCase {
    func testConstantsMatchCatalogue() throws {
        let catalogue = try jsonObject("protocol/catalogue.json")
        XCTAssertEqual(catalogue["version"] as? Int, ProtocolConstants.version)
        XCTAssertEqual(
            (catalogue["paths"] as? [String: String])?["deviceWebSocket"],
            ProtocolConstants.webSocketPath
        )
        XCTAssertEqual(
            (catalogue["paths"] as? [String: String])?["pairWebSocket"],
            ProtocolConstants.pairWebSocketPath
        )
        XCTAssertEqual(catalogue["actions"] as? [String], [MoteAction.lock.rawValue])
        let reasons = Set((catalogue["closes"] as? [[String: Any]] ?? []).compactMap { $0["reason"] as? String })
        XCTAssertEqual(reasons, Set(RelayCloseReason.allCases.map(\.rawValue)))
    }

    func testDecodesCommandAndResultFixtures() throws {
        let command = try JSONDecoder().decode(MoteCommand.self, from: data("protocol/fixtures/command.json"))
        XCTAssertEqual(command.version, ProtocolConstants.version)
        XCTAssertEqual(command.action, MoteAction.lock.rawValue)
        XCTAssertFalse(command.nonce.isEmpty)

        let result = try JSONDecoder().decode(
            MoteCommandResult.self,
            from: data("protocol/fixtures/command-result.json")
        )
        XCTAssertEqual(result.version, ProtocolConstants.version)
        XCTAssertEqual(result.status, .completed)
        XCTAssertNil(result.error)
    }

    func testDecodesDeviceAndPairingFixtures() throws {
        let names = [
            "protocol/fixtures/auth-macos.json",
            "protocol/fixtures/heartbeat.json",
            "protocol/fixtures/auth-result-ok.json",
            "protocol/fixtures/heartbeat-ack.json",
            "protocol/fixtures/error.json",
            "protocol/fixtures/pair-auth.json",
            "protocol/fixtures/pair-pending.json",
            "protocol/fixtures/pair-approved.json",
            "protocol/fixtures/pair-rejected.json",
            "protocol/fixtures/pair-expired.json",
        ]
        for name in names {
            let object = try jsonObject(name)
            XCTAssertEqual(object["version"] as? Int, ProtocolConstants.version, name)
            XCTAssertNotNil(object["type"] as? String, name)
        }
    }

    private func data(_ relativePath: String) throws -> Data {
        try Data(contentsOf: repoFile(relativePath))
    }

    private func jsonObject(_ relativePath: String) throws -> [String: Any] {
        let parsed = try JSONSerialization.jsonObject(with: data(relativePath))
        return try XCTUnwrap(parsed as? [String: Any])
    }

    private func repoFile(_ relativePath: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
    }
}
