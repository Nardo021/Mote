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
            _ = appState.isUnconfigured
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
        for item in MenuBarContent.items(for: MenuBarSnapshot(state: appState)) {
            switch item {
            case .status(let title, let tone, let filledDot):
                menu.addItem(statusItem(title: title, tone: tone, filledDot: filledDot))
            case .disabled(let title):
                menu.addItem(disabledItem(title))
            case .separator:
                menu.addItem(.separator())
            case .action(let action):
                addItem(action.title, action: selector(for: action))
            }
        }
    }

    private func statusItem(title: String, tone: MoteStatusTone, filledDot: Bool) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let color = MenuBarIconImage.nsColor(tone.color)
        item.attributedTitle = NSAttributedString(
            string: title,
            attributes: [
                .foregroundColor: color,
                .font: NSFont.menuFont(ofSize: 0),
            ]
        )
        item.image = MenuBarStatusDot.make(tone: tone, filled: filledDot)
        item.image?.isTemplate = false
        return item
    }

    private func selector(for action: MenuBarAction) -> Selector {
        switch action {
        case .openMote:
            return #selector(openMote)
        case .connect, .reconnect:
            return #selector(connect)
        case .quit:
            return #selector(quit)
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
    private func openMote() {
        appState.presentMainWindow()
    }

    @objc
    private func connect() {
        appState.connect()
    }

    @objc
    private func quit() {
        appState.quit()
    }
}
