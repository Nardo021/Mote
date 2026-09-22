import XCTest
@testable import Mote

final class MenuBarContentTests: XCTestCase {
    func testConnectedMenuHasColoredStatusAndNoDisconnect() {
        let items = MenuBarContent.items(for: connectedSnapshot)

        XCTAssertEqual(
            items,
            [
                .status(title: "Connected", tone: .success, filledDot: true),
                .disabled("MacBook Pro"),
                .separator,
                .action(.openMote),
                .separator,
                .action(.quit),
            ]
        )
        XCTAssertNil(MenuBarContent.connectionAction(for: connectedSnapshot))
    }

    func testUnconfiguredMenuOmitsConnectionActions() {
        let items = MenuBarContent.items(
            for: MenuBarSnapshot(
                connectionState: .notConfigured,
                deviceName: "MacBook Pro",
                isUnconfigured: true,
                isPairing: false,
                persistReconnectingWarning: false
            )
        )

        XCTAssertEqual(
            items,
            [
                .status(title: "Mote is not configured", tone: .offline, filledDot: false),
                .disabled("MacBook Pro"),
                .separator,
                .action(.openMote),
                .separator,
                .action(.quit),
            ]
        )
    }

    func testDisconnectedMenuOffersReconnect() {
        let items = MenuBarContent.items(
            for: MenuBarSnapshot(
                connectionState: .disconnected,
                deviceName: "MacBook Pro",
                isUnconfigured: false,
                isPairing: false,
                persistReconnectingWarning: false
            )
        )

        XCTAssertEqual(
            items,
            [
                .status(title: "Disconnected", tone: .offline, filledDot: false),
                .disabled("MacBook Pro"),
                .separator,
                .action(.openMote),
                .action(.reconnect),
                .separator,
                .action(.quit),
            ]
        )
    }

    func testErrorStatusUsesErrorTone() {
        let snapshot = MenuBarSnapshot(
            connectionState: .error("Relay unavailable"),
            deviceName: "MacBook Pro",
            isUnconfigured: false,
            isPairing: false,
            persistReconnectingWarning: false
        )

        XCTAssertEqual(
            MenuBarContent.statusItem(for: snapshot),
            .status(title: "Connection Error", tone: .error, filledDot: true)
        )
    }

    func testMenuOmitsDiagnosticsAndDisconnect() {
        let titles = MenuBarContent.items(for: connectedSnapshot).compactMap(\.title)

        XCTAssertFalse(titles.contains("Mote"))
        XCTAssertFalse(titles.contains("Disconnect"))
        XCTAssertFalse(titles.contains { $0.contains("Relay") })
        XCTAssertFalse(titles.contains { $0.contains("Lock Permission") })
        XCTAssertFalse(titles.contains("Start at Login"))
    }
}

private let connectedSnapshot = MenuBarSnapshot(
    connectionState: .connected,
    deviceName: "MacBook Pro",
    isUnconfigured: false,
    isPairing: false,
    persistReconnectingWarning: false
)

private extension MenuBarItem {
    var title: String? {
        switch self {
        case .status(let title, _, _):
            return title
        case .disabled(let title):
            return title
        case .action(let action):
            return action.title
        case .separator:
            return nil
        }
    }
}
