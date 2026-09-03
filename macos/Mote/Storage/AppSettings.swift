import Foundation

struct AppSettings: Equatable, Sendable {
    var deviceID: String
    var deviceName: String
    var wantsConnection: Bool
    var relayURLOverride: String?
}
