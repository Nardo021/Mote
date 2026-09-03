import Foundation

struct ReconnectPolicy: Sendable {
    static let delays: [TimeInterval] = [1, 2, 4, 8, 15, 30]
    static let cap: TimeInterval = 30
    static let jitterFraction: Double = 0.2

    var randomUnitInterval: @Sendable () -> Double = { Double.random(in: -1...1) }

    func delay(forAttempt attempt: Int) -> TimeInterval {
        let clampedAttempt = max(0, attempt)
        let index = min(clampedAttempt, Self.delays.count - 1)
        let base = Self.delays[index]
        let jitter = base * Self.jitterFraction * randomUnitInterval()
        return min(Self.cap, max(0.1, base + jitter))
    }

    func baseDelay(forAttempt attempt: Int) -> TimeInterval {
        let clampedAttempt = max(0, attempt)
        let index = min(clampedAttempt, Self.delays.count - 1)
        return Self.delays[index]
    }
}
