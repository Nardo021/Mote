import Foundation

actor MockRelayTransport: MessageTransport {
    private var incoming: [Data] = []
    private var waiters: [CheckedContinuation<Data, Error>] = []
    private(set) var outgoing: [Data] = []
    private var closed = false
    private var pendingReceiveError: TransportError?
    private(set) var connectCount = 0
    private(set) var closeCount = 0
    private var payloadOnNextClose: Data?

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
        connectCount += 1
        closed = false
        pendingReceiveError = nil
    }

    func messageTypes() -> [String] {
        outgoing.compactMap { data in
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            return object?["type"] as? String
        }
    }

    func send(_ data: Data) async throws {
        if closed {
            throw TransportError.notConnected
        }
        outgoing.append(data)
    }

    func receive() async throws -> Data {
        if let pendingReceiveError {
            let error = pendingReceiveError
            self.pendingReceiveError = nil
            throw error
        }
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

    func closeFromServer(reason: String) {
        failReceive(.closed(reason: reason))
    }

    func deliverOnNextClose(_ data: Data) {
        payloadOnNextClose = data
    }

    func close(reason: String?) async {
        closeCount += 1
        if let payload = payloadOnNextClose {
            payloadOnNextClose = nil
            if let waiter = waiters.first {
                waiters.removeFirst()
                waiter.resume(returning: payload)
            } else {
                incoming.append(payload)
            }
        }
        failReceive(.cancelled)
    }

    private func failReceive(_ error: TransportError) {
        closed = true
        let pending = waiters
        waiters.removeAll()
        if pending.isEmpty {
            pendingReceiveError = error
        } else {
            for waiter in pending {
                waiter.resume(throwing: error)
            }
        }
    }
}
