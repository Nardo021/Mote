using System.Text.Json;
using System.Text.Json.Serialization;

namespace Mote.Windows.Protocol;

public enum ProtocolParseFailure
{
    MalformedJson,
    InvalidMessage,
    UnsupportedVersion,
    UnknownType,
    UnknownAction,
}

public sealed class ProtocolParseResult
{
    private ProtocolParseResult(ProtocolFrame? frame, ProtocolParseFailure? failure)
    {
        Frame = frame;
        Failure = failure;
    }

    public ProtocolFrame? Frame { get; }

    public ProtocolParseFailure? Failure { get; }

    public bool IsSuccess => Frame is not null;

    public static ProtocolParseResult Success(ProtocolFrame frame) => new(frame, null);

    public static ProtocolParseResult Fail(ProtocolParseFailure failure) => new(null, failure);
}

public static class ProtocolCodec
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// Parses one Protocol v1 frame. Extra properties are ignored.
    /// A version other than 1 is rejected. Unknown command and auth actions are rejected.
    /// An unknown <c>type</c> is <see cref="ProtocolParseFailure.UnknownType"/> so the
    /// device channel can drop that frame and keep the socket.
    /// </summary>
    public static ProtocolParseResult Parse(string json)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.MalformedJson);
        }

        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
            }

            var root = document.RootElement;
            if (!TryReadVersion(root, out var version))
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.UnsupportedVersion);
            }

            if (version != ProtocolConstants.Version)
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.UnsupportedVersion);
            }

            if (!TryReadString(root, "type", out var type) || type.Length == 0)
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
            }

            return type switch
            {
                "auth" => ParseAuth(root),
                "auth_result" => ParseAuthResult(root),
                "heartbeat" => ParseHeartbeat(root),
                "heartbeat_ack" => ParseHeartbeatAck(root),
                "command" => ParseCommand(root),
                "command_result" => ParseCommandResult(root),
                "error" => ParseError(root),
                "pair_auth" => ParsePairAuth(root),
                "pair_pending" => ProtocolParseResult.Success(new PairPendingFrame
                {
                    Type = "pair_pending",
                    Version = ProtocolConstants.Version,
                }),
                "pair_approved" => ParsePairApproved(root),
                "pair_rejected" => ParsePairRejected(root),
                "pair_expired" => ProtocolParseResult.Success(new PairExpiredFrame
                {
                    Type = "pair_expired",
                    Version = ProtocolConstants.Version,
                }),
                _ => ProtocolParseResult.Fail(ProtocolParseFailure.UnknownType),
            };
        }
    }

    public static string Encode(ProtocolFrame frame)
    {
        if (frame.Version != ProtocolConstants.Version)
        {
            throw new InvalidOperationException("Refusing to encode a frame whose version is not Protocol v1.");
        }

        return frame switch
        {
            AuthFrame auth => JsonSerializer.Serialize(auth, JsonOptions),
            AuthResultFrame authResult => JsonSerializer.Serialize(authResult, JsonOptions),
            HeartbeatFrame heartbeat => JsonSerializer.Serialize(heartbeat, JsonOptions),
            HeartbeatAckFrame heartbeatAck => JsonSerializer.Serialize(heartbeatAck, JsonOptions),
            CommandFrame command => JsonSerializer.Serialize(command, JsonOptions),
            CommandResultFrame commandResult => JsonSerializer.Serialize(commandResult, JsonOptions),
            ErrorFrame error => JsonSerializer.Serialize(error, JsonOptions),
            PairAuthFrame pairAuth => JsonSerializer.Serialize(pairAuth, JsonOptions),
            PairPendingFrame pairPending => JsonSerializer.Serialize(pairPending, JsonOptions),
            PairApprovedFrame pairApproved => JsonSerializer.Serialize(pairApproved, JsonOptions),
            PairRejectedFrame pairRejected => JsonSerializer.Serialize(pairRejected, JsonOptions),
            PairExpiredFrame pairExpired => JsonSerializer.Serialize(pairExpired, JsonOptions),
            _ => throw new InvalidOperationException($"Unhandled protocol frame {frame.GetType().Name}."),
        };
    }

    private static ProtocolParseResult ParseAuth(JsonElement root)
    {
        if (!TryReadString(root, "device_id", out var deviceId) || !TryReadString(root, "credential", out var credential))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        string? appVersion = null;
        if (root.TryGetProperty("app_version", out _))
        {
            if (!TryReadString(root, "app_version", out var versionText))
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
            }

            appVersion = versionText;
        }

        string? platform = null;
        if (root.TryGetProperty("platform", out _))
        {
            if (!TryReadString(root, "platform", out var platformText) || !ProtocolConstants.IsKnownPlatform(platformText))
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
            }

            platform = platformText;
        }

        IReadOnlyList<string>? actions = null;
        if (root.TryGetProperty("actions", out var actionsElement))
        {
            if (!TryReadActions(actionsElement, out var parsed, out var failure))
            {
                return ProtocolParseResult.Fail(failure);
            }

            actions = parsed;
        }

        return ProtocolParseResult.Success(new AuthFrame
        {
            Type = "auth",
            Version = ProtocolConstants.Version,
            DeviceId = deviceId,
            Credential = credential,
            AppVersion = appVersion,
            Platform = platform,
            Actions = actions,
        });
    }

    private static ProtocolParseResult ParseAuthResult(JsonElement root)
    {
        if (!TryReadString(root, "status", out var status) || status is not ("ok" or "error"))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        string? error = null;
        if (status == "error")
        {
            if (!TryReadString(root, "error", out var errorText) || errorText.Length == 0)
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
            }

            error = errorText;
        }

        return ProtocolParseResult.Success(new AuthResultFrame
        {
            Type = "auth_result",
            Version = ProtocolConstants.Version,
            Status = status,
            Error = error,
        });
    }

    private static ProtocolParseResult ParseHeartbeat(JsonElement root)
    {
        if (!TryReadString(root, "device_id", out var deviceId) || !TryReadInt64(root, "sent_at", out var sentAt))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        return ProtocolParseResult.Success(new HeartbeatFrame
        {
            Type = "heartbeat",
            Version = ProtocolConstants.Version,
            DeviceId = deviceId,
            SentAt = sentAt,
        });
    }

    private static ProtocolParseResult ParseHeartbeatAck(JsonElement root)
    {
        if (!TryReadInt64(root, "sent_at", out var sentAt) || !TryReadInt64(root, "server_at", out var serverAt))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        return ProtocolParseResult.Success(new HeartbeatAckFrame
        {
            Type = "heartbeat_ack",
            Version = ProtocolConstants.Version,
            SentAt = sentAt,
            ServerAt = serverAt,
        });
    }

    private static ProtocolParseResult ParseCommand(JsonElement root)
    {
        if (!TryReadString(root, "id", out var id)
            || !TryReadString(root, "device_id", out var deviceId)
            || !TryReadString(root, "action", out var action)
            || !TryReadInt64(root, "created_at", out var createdAt)
            || !TryReadInt64(root, "expires_at", out var expiresAt)
            || !TryReadString(root, "nonce", out var nonce))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        if (!ProtocolConstants.IsActiveAction(action))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.UnknownAction);
        }

        return ProtocolParseResult.Success(new CommandFrame
        {
            Type = "command",
            Version = ProtocolConstants.Version,
            Id = id,
            DeviceId = deviceId,
            Action = action,
            CreatedAt = createdAt,
            ExpiresAt = expiresAt,
            Nonce = nonce,
        });
    }

    private static ProtocolParseResult ParseCommandResult(JsonElement root)
    {
        if (!TryReadString(root, "command_id", out var commandId)
            || !TryReadString(root, "status", out var status)
            || !TryReadInt64(root, "completed_at", out var completedAt)
            || !CommandResultStatuses.IsKnown(status))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        string? error = null;
        if (root.TryGetProperty("error", out _))
        {
            if (!TryReadString(root, "error", out var errorText))
            {
                return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
            }

            error = errorText;
        }

        return ProtocolParseResult.Success(CommandResultFrame.Create(commandId, status, completedAt, error));
    }

    private static ProtocolParseResult ParseError(JsonElement root)
    {
        if (!TryReadString(root, "error", out var error) || error.Length == 0)
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        return ProtocolParseResult.Success(new ErrorFrame
        {
            Type = "error",
            Version = ProtocolConstants.Version,
            Error = error,
        });
    }

    private static ProtocolParseResult ParsePairAuth(JsonElement root)
    {
        if (!TryReadString(root, "request_id", out var requestId)
            || requestId.Length == 0
            || !TryReadString(root, "pair_secret", out var pairSecret)
            || pairSecret.Length == 0)
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        return ProtocolParseResult.Success(new PairAuthFrame
        {
            Type = "pair_auth",
            Version = ProtocolConstants.Version,
            RequestId = requestId,
            PairSecret = pairSecret,
        });
    }

    private static ProtocolParseResult ParsePairApproved(JsonElement root)
    {
        if (!TryReadString(root, "device_id", out var deviceId)
            || !TryReadString(root, "credential", out var credential)
            || !TryReadString(root, "name", out var name))
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        return ProtocolParseResult.Success(new PairApprovedFrame
        {
            Type = "pair_approved",
            Version = ProtocolConstants.Version,
            DeviceId = deviceId,
            Credential = credential,
            Name = name,
        });
    }

    private static ProtocolParseResult ParsePairRejected(JsonElement root)
    {
        if (!TryReadString(root, "error", out var error) || error.Length == 0)
        {
            return ProtocolParseResult.Fail(ProtocolParseFailure.InvalidMessage);
        }

        return ProtocolParseResult.Success(new PairRejectedFrame
        {
            Type = "pair_rejected",
            Version = ProtocolConstants.Version,
            Error = error,
        });
    }

    private static bool TryReadActions(
        JsonElement element,
        out IReadOnlyList<string> actions,
        out ProtocolParseFailure failure)
    {
        actions = [];
        failure = ProtocolParseFailure.InvalidMessage;
        if (element.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        var parsed = new List<string>();
        foreach (var item in element.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                return false;
            }

            var action = item.GetString() ?? "";
            if (!ProtocolConstants.IsActiveAction(action) || parsed.Contains(action, StringComparer.Ordinal))
            {
                failure = ProtocolParseFailure.UnknownAction;
                return false;
            }

            parsed.Add(action);
        }

        actions = parsed;
        return true;
    }

    private static bool TryReadVersion(JsonElement root, out int version)
    {
        version = 0;
        if (!root.TryGetProperty("version", out var element) || element.ValueKind != JsonValueKind.Number)
        {
            return false;
        }

        return element.TryGetInt32(out version);
    }

    private static bool TryReadString(JsonElement root, string name, out string value)
    {
        value = "";
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = element.GetString();
        if (text is null)
        {
            return false;
        }

        value = text;
        return true;
    }

    private static bool TryReadInt64(JsonElement root, string name, out long value)
    {
        value = 0;
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.Number)
        {
            return false;
        }

        return element.TryGetInt64(out value);
    }
}
