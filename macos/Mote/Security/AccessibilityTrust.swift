import ApplicationServices
import Foundation

enum AccessibilityLiveProbe: Equatable, Sendable {
    case trusted
    case denied
    case unknown
}

enum AccessibilityTrust {
    static func resolve(declared: Bool, probe: AccessibilityLiveProbe) -> Bool {
        switch probe {
        case .trusted:
            return true
        case .denied:
            return false
        case .unknown:
            return declared
        }
    }

    static func probe(from status: AXError) -> AccessibilityLiveProbe {
        switch status {
        case .success, .noValue, .attributeUnsupported:
            return .trusted
        case .apiDisabled:
            return .denied
        default:
            return .unknown
        }
    }

    static func liveProbe() -> AccessibilityLiveProbe {
        let element = AXUIElementCreateSystemWide()
        var names: CFArray?
        let status = AXUIElementCopyAttributeNames(element, &names)
        return probe(from: status)
    }
}
