import OSLog

enum MoteLog {
    static let subsystem = "me.yanze.mote"

    static let app = Logger(subsystem: subsystem, category: "app")
    static let network = Logger(subsystem: subsystem, category: "network")
    static let agent = Logger(subsystem: subsystem, category: "agent")
    static let commands = Logger(subsystem: subsystem, category: "commands")
    static let security = Logger(subsystem: subsystem, category: "security")
    static let actions = Logger(subsystem: subsystem, category: "actions")
}
