import AppKit

@MainActor
final class MenuBarStatusItemController: NSObject {
    private let appState: AppState
    private let statusItem: NSStatusItem
    private let menu = NSMenu()
    private var appearanceObservation: NSKeyValueObservation?

    init(appState: AppState) {
        self.appState = appState
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        super.init()
        statusItem.isVisible = true
        configureButton()
        statusItem.menu = menu
        observeState()
        refresh()
    }

    private func configureButton() {
        guard let button = statusItem.button else { return }
        button.imagePosition = .imageOnly
        button.appearsDisabled = false
        appearanceObservation = button.observe(\.effectiveAppearance, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.refreshIcon()
            }
        }
    }

    private func observeState() {
        withObservationTracking {
            _ = appState.connectionState
            _ = appState.persistReconnectingWarning
            _ = appState.deviceName
            _ = appState.menuRelayText
            _ = appState.lockPermissionText
            _ = appState.startAtLogin
            _ = appState.isUnconfigured
            _ = appState.wantsConnection
            refresh()
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.observeState()
            }
        }
    }

    private func refresh() {
        refreshIcon()
        rebuildMenu()
    }

    private func refreshIcon() {
        let tone = appState.connectionState.statusTone(persistWarning: appState.persistReconnectingWarning)
        let appearance = statusItem.button?.effectiveAppearance ?? NSApp.effectiveAppearance
        let image = MenuBarIconImage.make(tone: tone, appearance: appearance)
        statusItem.button?.contentTintColor = nil
        statusItem.button?.image = image
        statusItem.button?.image?.isTemplate = false
        let title = "Mote, \(appState.connectionState.title)"
        statusItem.button?.toolTip = title
        statusItem.button?.setAccessibilityTitle(title)
    }

    private func rebuildMenu() {
        menu.removeAllItems()
        menu.addItem(disabledItem("Mote"))

        if appState.isUnconfigured {
            if appState.isPairing {
                menu.addItem(disabledItem(appState.connectionState.menuTitle))
            } else {
                menu.addItem(disabledItem("Mote is not configured"))
            }
            menu.addItem(disabledItem(appState.deviceName))
        } else {
            menu.addItem(disabledItem(appState.connectionState.menuTitle))
            menu.addItem(disabledItem(appState.deviceName))
            if let relayLine = appState.menuRelayText {
                menu.addItem(disabledItem("Relay"))
                menu.addItem(disabledItem(relayLine))
            }
        }

        menu.addItem(disabledItem("Lock Permission: \(appState.lockPermissionText)"))

        let loginItem = NSMenuItem(
            title: "Start at Login",
            action: #selector(toggleStartAtLogin(_:)),
            keyEquivalent: ""
        )
        loginItem.target = self
        loginItem.state = appState.startAtLogin ? .on : .off
        menu.addItem(loginItem)

        menu.addItem(.separator())
        addItem("Open Mote", action: #selector(openMote))
        if !appState.isUnconfigured {
            if appState.showsDisconnectAction {
                addItem("Disconnect", action: #selector(disconnect))
            } else {
                addItem(reconnectTitle, action: #selector(connect))
            }
        }

        menu.addItem(.separator())
        addItem("Quit Mote", action: #selector(quit))
    }

    private var reconnectTitle: String {
        switch appState.connectionState {
        case .disconnected, .error, .reconnecting, .disabled:
            return "Reconnect"
        case .notConfigured, .pairing, .connecting, .authenticating, .connected:
            return "Connect"
        }
    }

    private func disabledItem(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    private func addItem(_ title: String, action: Selector) {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
    }

    @objc
    private func toggleStartAtLogin(_ sender: NSMenuItem) {
        appState.setStartAtLogin(!appState.startAtLogin)
    }

    @objc
    private func openMote() {
        appState.presentMainWindow()
    }

    @objc
    private func connect() {
        appState.connect()
    }

    @objc
    private func disconnect() {
        appState.disconnect()
    }

    @objc
    private func quit() {
        appState.quit()
    }
}
