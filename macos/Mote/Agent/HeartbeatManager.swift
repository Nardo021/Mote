import Foundation

actor HeartbeatManager {
    let interval: Duration

    init(interval: Duration = .seconds(ProtocolConstants.heartbeatIntervalSeconds)) {
        self.interval = interval
    }

    func run(send: @escaping @Sendable () async throws -> Void) async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: interval)
            } catch {
                return
            }
            if Task.isCancelled {
                return
            }
            do {
                try await send()
            } catch {
                MoteLog.network.error("Heartbeat send failed")
                return
            }
        }
    }
}
