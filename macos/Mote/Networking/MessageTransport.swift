import Foundation

enum TransportError: Error, Equatable, Sendable {
    case notConnected
    case invalidUTF8
    case invalidRelayResponse
    case cancelled
}

protocol MessageTransport: Sendable {
    func connect() async throws
    func send(_ data: Data) async throws
    func receive() async throws -> Data
    func close(reason: String?) async
}
