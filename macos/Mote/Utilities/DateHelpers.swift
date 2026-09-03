import Foundation

enum DateHelpers {
    static func nowMilliseconds() -> Int64 {
        Int64((Date().timeIntervalSince1970 * 1000.0).rounded())
    }

    static func milliseconds(from date: Date) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1000.0).rounded())
    }

    static func date(fromMilliseconds value: Int64) -> Date {
        Date(timeIntervalSince1970: TimeInterval(value) / 1000.0)
    }

    static func formatLatency(_ latency: TimeInterval) -> String {
        let milliseconds = (latency * 1000.0).rounded()
        return "\(Int(milliseconds))\u{00A0}ms"
    }
}
