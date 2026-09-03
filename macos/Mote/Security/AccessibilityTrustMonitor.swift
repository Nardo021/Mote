import AppKit
import Foundation

@MainActor
final class AccessibilityTrustMonitor {
    static let apiChangeDelay: TimeInterval = 0.25
    static let pollInterval: TimeInterval = 1

    private let refresh: () -> Void
    private let schedule: (TimeInterval, @escaping () -> Void) -> Void
    private var timer: Timer?
    private var observers: [NSObjectProtocol] = []

    init(
        refresh: @escaping () -> Void,
        schedule: @escaping (TimeInterval, @escaping () -> Void) -> Void = { delay, work in
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        }
    ) {
        self.refresh = refresh
        self.schedule = schedule
    }

    func start() {
        stop()
        poll()

        let center = DistributedNotificationCenter.default()
        observers.append(
            center.addObserver(
                forName: Notification.Name("com.apple.accessibility.api"),
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.accessibilityAPIDidChange()
                }
            }
        )

        let local = NotificationCenter.default
        observers.append(
            local.addObserver(
                forName: NSApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.poll()
                }
            }
        )
        observers.append(
            local.addObserver(
                forName: NSWindow.didBecomeKeyNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.poll()
                }
            }
        )

        let timer = Timer(timeInterval: Self.pollInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.poll()
            }
        }
        timer.tolerance = 0.25
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        let center = DistributedNotificationCenter.default()
        for observer in observers {
            center.removeObserver(observer)
            NotificationCenter.default.removeObserver(observer)
        }
        observers.removeAll()
    }

    func accessibilityAPIDidChange() {
        schedule(Self.apiChangeDelay, refresh)
    }

    func poll() {
        refresh()
    }
}
