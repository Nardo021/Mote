import Foundation
import ServiceManagement

enum LoginItemService {
    @MainActor
    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    @MainActor
    static func setEnabled(_ enabled: Bool) throws {
        let service = SMAppService.mainApp
        if enabled {
            if service.status != .enabled {
                try service.register()
            }
        } else if service.status == .enabled {
            try service.unregister()
        }
        MoteLog.app.info("Start at login set to \(enabled, privacy: .public)")
    }
}
