import SwiftUI

enum MoteStatusTone: Equatable, Sendable {
    case success
    case warning
    case error
    case accent
    case offline

    var color: Color {
        switch self {
        case .success:
            return MoteColors.success
        case .warning:
            return MoteColors.warning
        case .error:
            return MoteColors.error
        case .accent:
            return MoteColors.accent
        case .offline:
            return MoteColors.offline
        }
    }
}
