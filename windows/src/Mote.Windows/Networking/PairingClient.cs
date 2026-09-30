using Mote.Windows.Protocol;

namespace Mote.Windows.Networking;

public sealed class PairingClient
{
    public PairAuthFrame BuildAuth(string requestId, string pairSecret) =>
        new()
        {
            Type = "pair_auth",
            Version = ProtocolConstants.Version,
            RequestId = requestId,
            PairSecret = pairSecret,
        };

    public Uri ResolvePairSocket(string relayUrl)
    {
        if (!RelayAddress.TryParseBase(relayUrl, out var baseUri) || baseUri is null)
        {
            throw new FormatException("Relay URL is not configured.");
        }

        return RelayAddress.PairWebSocket(baseUri);
    }
}
