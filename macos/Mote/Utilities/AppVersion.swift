import Foundation

enum AppVersion {
    static var display: String {
        display(from: Bundle.main.infoDictionary)
    }

    static func display(from info: [String: Any]?) -> String {
        let marketing = string(from: info, key: "CFBundleShortVersionString")
        let build = string(from: info, key: "CFBundleVersion")
        switch (marketing, build) {
        case let (marketing?, build?):
            return "\(marketing) (\(build))"
        case let (marketing?, nil):
            return marketing
        case let (nil, build?):
            return build
        case (nil, nil):
            return "unknown"
        }
    }

    private static func string(from info: [String: Any]?, key: String) -> String? {
        guard let value = (info?[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty
        else {
            return nil
        }
        return value
    }
}
