import Foundation

enum DeviceIDDisplay {
    static func abbreviated(_ deviceID: String) -> String {
        let compact = deviceID.replacingOccurrences(of: "-", with: "")
        guard compact.count > 8 else {
            return deviceID
        }
        return "\(compact.prefix(4))…\(compact.suffix(4))"
    }
}
