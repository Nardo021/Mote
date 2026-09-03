import Foundation

enum MoteAction: String, Codable, Sendable, CaseIterable {
    case lock
    case sleep
    case mute
    case unmute
    case playPause = "play_pause"

    var isImplemented: Bool {
        switch self {
        case .lock:
            return true
        case .sleep, .mute, .unmute, .playPause:
            return false
        }
    }
}
