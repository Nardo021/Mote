using System.Text.Json;
using Mote.Windows.Protocol;

namespace Mote.Windows.Networking;

internal enum DeviceReadKind
{
    Malformed,
    Pairing,
    Command,
    Frame,
    Unknown,
}

internal readonly record struct DeviceRead(DeviceReadKind Kind, ProtocolFrame? Frame, CommandFrame? Command);

/// <summary>
/// Device-channel read. Command frames stay loose enough for the validator to
/// answer with <c>command_result</c>. <see cref="ProtocolCodec.Parse"/> stays strict.
/// </summary>
internal static class DeviceFrameReader
{
    public static DeviceRead Parse(string json)
    {
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return new DeviceRead(DeviceReadKind.Malformed, null, null);
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return new DeviceRead(DeviceReadKind.Malformed, null, null);
            }

            if (!TryString(root, "type", out var type))
            {
                return new DeviceRead(DeviceReadKind.Malformed, null, null);
            }

            if (type is "pair_auth" or "pair_pending" or "pair_approved" or "pair_rejected" or "pair_expired")
            {
                return new DeviceRead(DeviceReadKind.Pairing, null, null);
            }

            if (type == "command")
            {
                return TryLooseCommand(root, out var command)
                    ? new DeviceRead(DeviceReadKind.Command, null, command)
                    : new DeviceRead(DeviceReadKind.Malformed, null, null);
            }

            var parsed = ProtocolCodec.Parse(json);
            if (!parsed.IsSuccess || parsed.Frame is null)
            {
                return parsed.Failure == ProtocolParseFailure.UnknownType
                    ? new DeviceRead(DeviceReadKind.Unknown, null, null)
                    : new DeviceRead(DeviceReadKind.Malformed, null, null);
            }

            return new DeviceRead(DeviceReadKind.Frame, parsed.Frame, null);
        }
    }

    private static bool TryLooseCommand(JsonElement root, out CommandFrame command)
    {
        command = null!;
        if (!TryString(root, "id", out var id))
        {
            return false;
        }

        command = new CommandFrame
        {
            Type = "command",
            Version = TryInt(root, "version") ?? 0,
            Id = id,
            DeviceId = TryString(root, "device_id", out var deviceId) ? deviceId : "",
            Action = TryString(root, "action", out var action) ? action : "",
            CreatedAt = TryInt64(root, "created_at") ?? 0,
            ExpiresAt = TryInt64(root, "expires_at") ?? 0,
            Nonce = TryString(root, "nonce", out var nonce) ? nonce : "",
        };
        return true;
    }

    private static bool TryString(JsonElement root, string name, out string value)
    {
        value = "";
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = element.GetString();
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        value = text;
        return true;
    }

    private static int? TryInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return element.TryGetInt32(out var value) ? value : null;
    }

    private static long? TryInt64(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return element.TryGetInt64(out var value) ? value : null;
    }
}
