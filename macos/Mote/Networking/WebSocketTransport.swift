import Foundation

actor WebSocketTransport: MessageTransport {
    private let url: URL
    private let session: URLSession
    private var task: URLSessionWebSocketTask?

    init(url: URL, session: URLSession = .shared) {
        self.url = url
        self.session = session
    }

    func connect() async throws {
        await close(reason: nil)
        let socket = session.webSocketTask(with: url)
        task = socket
        socket.resume()
        MoteLog.network.info("WebSocket connecting")
    }

    func send(_ data: Data) async throws {
        guard let task else {
            throw TransportError.notConnected
        }
        guard let text = String(data: data, encoding: .utf8) else {
            throw TransportError.invalidUTF8
        }
        try await task.send(.string(text))
    }

    func receive() async throws -> Data {
        guard let task else {
            throw TransportError.notConnected
        }
        do {
            let message = try await task.receive()
            switch message {
            case .string(let text):
                guard let data = text.data(using: .utf8) else {
                    throw TransportError.invalidUTF8
                }
                return data
            case .data(let data):
                return data
            @unknown default:
                throw TransportError.invalidRelayResponse
            }
        } catch {
            throw closedError(from: task) ?? error
        }
    }

    private func closedError(from task: URLSessionWebSocketTask) -> TransportError? {
        let reason = task.closeReason
            .flatMap { String(data: $0, encoding: .utf8) }?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if reason == "client_close" {
            return .cancelled
        }
        if task.closeCode == .invalid, reason == nil {
            return nil
        }
        return .closed(reason: reason)
    }

    func close(reason: String?) async {
        let reasonData = reason?.data(using: .utf8)
        task?.cancel(with: .goingAway, reason: reasonData)
        task = nil
    }
}
