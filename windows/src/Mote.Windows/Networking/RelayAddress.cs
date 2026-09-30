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

    public static Uri PairRequests(Uri baseUri) => Http(baseUri, ClientPolicy.PairRequestsPath);

    public static Uri PairCancel(Uri baseUri, string requestId)
    {
        if (requestId.Length == 0
            || requestId.Length > 128
            || requestId.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not ('-' or '_')))
        {
            throw new ArgumentException("Pair request id is invalid.", nameof(requestId));
        }

        return Http(baseUri, $"{ClientPolicy.PairRequestsPath}/{requestId}/cancel");
    }

    private static Uri Http(Uri baseUri, string path)
    {
        var builder = new UriBuilder(baseUri)
        {
            Path = path,
            Query = "",
            Fragment = "",
        };
        return builder.Uri;
    }

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
