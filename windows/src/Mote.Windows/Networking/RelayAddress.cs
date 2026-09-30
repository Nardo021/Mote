using Mote.Windows.Protocol;

namespace Mote.Windows.Networking;

public static class RelayAddress
{
    public static bool TryParseBase(string raw, out Uri? baseUri)
    {
        baseUri = null;
        var trimmed = raw.Trim();
        if (trimmed.Length == 0 || trimmed.Any(character => char.IsWhiteSpace(character)))
        {
            return false;
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme is not ("http" or "https"))
        {
            return false;
        }

        if (string.IsNullOrEmpty(uri.IdnHost))
        {
            return false;
        }

        baseUri = uri;
        return true;
    }

    public static Uri DeviceWebSocket(Uri baseUri) => Socket(baseUri, ProtocolConstants.DeviceWebSocketPath);

    public static Uri PairWebSocket(Uri baseUri) => Socket(baseUri, ProtocolConstants.PairWebSocketPath);

    private static Uri Socket(Uri baseUri, string path)
    {
        var builder = new UriBuilder(baseUri)
        {
            Path = path,
            Query = "",
            Fragment = "",
        };
        builder.Scheme = builder.Scheme.ToLowerInvariant() switch
        {
            "https" => "wss",
            "http" => "ws",
            "wss" => "wss",
            "ws" => "ws",
            _ => throw new InvalidOperationException($"Unhandled relay scheme {builder.Scheme}."),
        };
        return builder.Uri;
    }
}
