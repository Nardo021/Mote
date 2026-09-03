import Foundation

actor MockRelayTransport: MessageTransport {
    private var incoming: [Data] = []
    private var waiters: [CheckedContinuation<Data, Error>] = []
    private(set) var outgoing: [Data] = []
    private var closed = false

    func enqueueIncoming(_ data: Data) {
        if let waiter = waiters.first {
            waiters.removeFirst()
            waiter.resume(returning: data)
        } else {
            incoming.append(data)
        }
    }

    func sentMessages() -> [Data] {
        outgoing
    }

    func connect() async throws {
        closed = false
    }

    func send(_ data: Data) async throws {
        if closed {
            throw TransportError.notConnected
        }
        outgoing.append(data)
    }

    func receive() async throws -> Data {
        if closed {
            throw TransportError.cancelled
        }
        if !incoming.isEmpty {
            return incoming.removeFirst()
        }
        return try await withCheckedThrowingContinuation { continuation in
            waiters.append(continuation)
        }
    }

    func close(reason: String?) async {
        closed = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending {
            waiter.resume(throwing: TransportError.cancelled)
        }
    }
}
