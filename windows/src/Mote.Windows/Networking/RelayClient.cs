using Mote.Windows.Protocol;
using Mote.Windows.Storage;

namespace Mote.Windows.Networking;

public sealed class RelayClient
{
    public RelayClient(IMessageTransport transport, ReconnectPolicy? reconnect = null)
    {
        Transport = transport;
        Reconnect = reconnect ?? new ReconnectPolicy();
    }

    public IMessageTransport Transport { get; }

    public ReconnectPolicy Reconnect { get; }

    public AuthFrame BuildAuth(AppSettings settings, string credential, string appVersion) =>
        AuthFrame.ForWindows(settings.DeviceId, credential, appVersion);

    public Uri ResolveDeviceSocket(string relayUrl)
    {
        if (!RelayAddress.TryParseBase(relayUrl, out var baseUri) || baseUri is null)
        {
            throw new FormatException("Relay URL is not configured.");
        }

        return RelayAddress.DeviceWebSocket(baseUri);
    }
}
