using System.Text.Json.Serialization;

namespace Mote.Windows.Protocol;

public abstract record ProtocolFrame
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("version")]
    public required int Version { get; init; }
}

public sealed record AuthFrame : ProtocolFrame
{
    [JsonPropertyName("device_id")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("credential")]
    public required string Credential { get; init; }

    [JsonPropertyName("app_version")]
    public string? AppVersion { get; init; }

    [JsonPropertyName("platform")]
    public string? Platform { get; init; }

    [JsonPropertyName("actions")]
    public IReadOnlyList<string>? Actions { get; init; }

    public static AuthFrame ForWindows(string deviceId, string credential, string appVersion) =>
        new()
        {
            Type = "auth",
            Version = ProtocolConstants.Version,
            DeviceId = deviceId,
            Credential = credential,
            AppVersion = appVersion,
            Platform = ProtocolConstants.PlatformWindows,
            Actions = ProtocolConstants.ActiveActions,
        };

    public override string ToString() =>
        $"auth device_id={DeviceId} platform={Platform}";
}

public sealed record AuthResultFrame : ProtocolFrame
{
    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("error")]
    public string? Error { get; init; }

    public bool IsSuccessful => Status == "ok";
}

public sealed record HeartbeatFrame : ProtocolFrame
{
    [JsonPropertyName("device_id")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("sent_at")]
    public required long SentAt { get; init; }
}

public sealed record HeartbeatAckFrame : ProtocolFrame
{
    [JsonPropertyName("sent_at")]
    public required long SentAt { get; init; }

    [JsonPropertyName("server_at")]
    public required long ServerAt { get; init; }
}

public sealed record CommandFrame : ProtocolFrame
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("device_id")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("action")]
    public required string Action { get; init; }

    [JsonPropertyName("created_at")]
    public required long CreatedAt { get; init; }

    [JsonPropertyName("expires_at")]
    public required long ExpiresAt { get; init; }

    [JsonPropertyName("nonce")]
    public required string Nonce { get; init; }
}

public sealed record CommandResultFrame : ProtocolFrame
{
    [JsonPropertyName("command_id")]
    public required string CommandId { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("completed_at")]
    public required long CompletedAt { get; init; }

    [JsonPropertyName("error")]
    public string? Error { get; init; }

    public static CommandResultFrame Create(
        string commandId,
        string status,
        long completedAt,
        string? error = null) =>
        new()
        {
            Type = "command_result",
            Version = ProtocolConstants.Version,
            CommandId = commandId,
            Status = status,
            CompletedAt = completedAt,
            Error = error,
        };
}

public sealed record ErrorFrame : ProtocolFrame
{
    [JsonPropertyName("error")]
    public required string Error { get; init; }
}

public sealed record PairAuthFrame : ProtocolFrame
{
    [JsonPropertyName("request_id")]
    public required string RequestId { get; init; }

    [JsonPropertyName("pair_secret")]
    public required string PairSecret { get; init; }

    public override string ToString() =>
        $"pair_auth request_id={RequestId}";
}

public sealed record PairPendingFrame : ProtocolFrame;

public sealed record PairApprovedFrame : ProtocolFrame
{
    [JsonPropertyName("device_id")]
    public required string DeviceId { get; init; }

    [JsonPropertyName("credential")]
    public required string Credential { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    public override string ToString() =>
        $"pair_approved device_id={DeviceId} name={Name}";
}

public sealed record PairRejectedFrame : ProtocolFrame
{
    [JsonPropertyName("error")]
    public required string Error { get; init; }
}

public sealed record PairExpiredFrame : ProtocolFrame;
