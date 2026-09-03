import Foundation
import SystemConfiguration

struct Device: Equatable, Sendable {
    var id: String
    var name: String
}

enum SystemDeviceName {
    static func current() -> String {
        if let name = SCDynamicStoreCopyComputerName(nil, nil) as String?, !name.isEmpty {
            return name
        }
        return "Mac"
    }
}
