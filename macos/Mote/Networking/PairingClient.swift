import Foundation

struct PairCreated: Equatable, Sendable {
    let requestID: String
    let pairSecret: String
    let expiresAt: Int64
}

enum PairDecision: Equatable, Sendable {
    case approved(deviceID: String, credential: String, name: String)
    case rejected(reason: String)
    case expired
}

enum PairingError: Error, Equatable, Sendable {
    case invalidResponse
    case requestFailed(String)
}

protocol PairingServicing: Sendable {
    func createRequest(
        configuration: RelayConfiguration,
        deviceID: String,
        deviceName: String
    ) async throws -> PairCreated

    func waitForDecision(
        configuration: RelayConfiguration,
        requestID: String,
        pairSecret: String
    ) async throws -> PairDecision

    func cancel(
        configuration: RelayConfiguration,
        requestID: String,
        pairSecret: String
    ) async throws
}

struct RelayPairingClient: PairingServicing {
    private let session: URLSession
    private let transportFactory: @Sendable (URL) -> any MessageTransport

    init(
        session: URLSession = .shared,
        transportFactory: @escaping @Sendable (URL) -> any MessageTransport = { WebSocketTransport(url: $0) }
    ) {
        self.session = session
        self.transportFactory = transportFactory
    }

    func createRequest(
        configuration: RelayConfiguration,
        deviceID: String,
        deviceName: String
    ) async throws -> PairCreated {
        var request = URLRequest(url: configuration.pairRequestsURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try ProtocolJSON.encode(
            PairCreateBody(deviceID: deviceID, deviceName: deviceName)
        )
        let (data, response) = try await session.data(for: request)
        try Self.expectSuccess(data: data, response: response)
        let created = try ProtocolJSON.decode(PairCreatedResponse.self, from: data)
        return PairCreated(
            requestID: created.requestID,
            pairSecret: created.pairSecret,
            expiresAt: created.expiresAt
        )
    }

    func waitForDecision(
        configuration: RelayConfiguration,
        requestID: String,
        pairSecret: String
    ) async throws -> PairDecision {
        let transport = transportFactory(
            configuration.pairWebSocketURL(requestID: requestID, pairSecret: pairSecret)
        )
        try await transport.connect()
        defer {
            Task {
                await transport.close(reason: nil)
            }
        }
        while !Task.isCancelled {
            let data = try await transport.receive()
            switch try PairSocketMessage.decode(from: data) {
            case .pending:
                continue
            case .approved(let message):
                return .approved(
                    deviceID: message.deviceID,
                    credential: message.credential,
                    name: message.name
                )
            case .rejected(let message):
                return .rejected(reason: message.error ?? "rejected")
            case .expired:
                return .expired
            case .unknown:
                continue
            }
        }
        throw CancellationError()
    }

    func cancel(
        configuration: RelayConfiguration,
        requestID: String,
        pairSecret: String
    ) async throws {
        var request = URLRequest(url: configuration.pairCancelURL(requestID: requestID))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try ProtocolJSON.encode(PairCancelBody(pairSecret: pairSecret))
        let (data, response) = try await session.data(for: request)
        try Self.expectSuccess(data: data, response: response)
    }

    private static func expectSuccess(data: Data, response: URLResponse) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else {
            let message = (try? ProtocolJSON.decode(RelayAPIError.self, from: data))?.error.message
            throw PairingError.requestFailed(message ?? "Could not complete pairing.")
        }
    }
}

private struct PairCreateBody: Encodable {
    var deviceID: String
    var deviceName: String

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case deviceName = "device_name"
    }
}

private struct PairCancelBody: Encodable {
    var pairSecret: String

    enum CodingKeys: String, CodingKey {
        case pairSecret = "pair_secret"
    }
}

private struct PairCreatedResponse: Decodable {
    var requestID: String
    var pairSecret: String
    var expiresAt: Int64

    enum CodingKeys: String, CodingKey {
        case requestID = "request_id"
        case pairSecret = "pair_secret"
        case expiresAt = "expires_at"
    }
}

private struct RelayAPIError: Decodable {
    struct Body: Decodable {
        var message: String?
    }

    var error: Body
}

private struct PairApprovedPayload: Decodable {
    var deviceID: String
    var credential: String
    var name: String

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case credential
        case name
    }
}

private struct PairRejectedPayload: Decodable {
    var error: String?
}

private enum PairSocketMessage {
    case pending
    case approved(PairApprovedPayload)
    case rejected(PairRejectedPayload)
    case expired
    case unknown

    static func decode(from data: Data) throws -> PairSocketMessage {
        let envelope = try ProtocolJSON.decode(MessageEnvelope.self, from: data)
        switch envelope.type {
        case "pair_pending":
            return .pending
        case "pair_approved":
            return .approved(try ProtocolJSON.decode(PairApprovedPayload.self, from: data))
        case "pair_rejected":
            return .rejected(try ProtocolJSON.decode(PairRejectedPayload.self, from: data))
        case "pair_expired":
            return .expired
        default:
            return .unknown
        }
    }
}
