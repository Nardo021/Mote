using System.IO;
using System.Net.WebSockets;

namespace Mote.Windows.Networking;

public sealed class WebSocketTransport : IMessageTransport, IAsyncDisposable
{
    private ClientWebSocket? _socket;

    public async Task ConnectAsync(Uri uri, CancellationToken cancellationToken)
    {
        await CloseAsync(reason: null, cancellationToken).ConfigureAwait(false);
        var socket = new ClientWebSocket();
        try
        {
            await socket.ConnectAsync(uri, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            socket.Dispose();
            throw;
        }

        _socket = socket;
    }

    public async Task SendAsync(ReadOnlyMemory<byte> payload, CancellationToken cancellationToken)
    {
        var socket = OpenSocket();
        await socket.SendAsync(payload, WebSocketMessageType.Text, endOfMessage: true, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<byte[]> ReceiveAsync(CancellationToken cancellationToken)
    {
        var socket = OpenSocket();
        using var buffer = new MemoryStream();
        var chunk = new byte[8 * 1024];
        while (true)
        {
            var result = await socket.ReceiveAsync(chunk, cancellationToken).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                throw new TransportException(TransportFailure.Closed, "The relay socket closed.");
            }

            buffer.Write(chunk, 0, result.Count);
            if (result.EndOfMessage)
            {
                return buffer.ToArray();
            }
        }
    }

    public async Task CloseAsync(string? reason, CancellationToken cancellationToken)
    {
        var socket = _socket;
        _socket = null;
        if (socket is null)
        {
            return;
        }

        try
        {
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, reason, cancellationToken)
                    .ConfigureAwait(false);
            }
        }
        catch (WebSocketException)
        {
            // The socket is already unusable. Dropping it is the close.
        }
        finally
        {
            socket.Dispose();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await CloseAsync(reason: null, CancellationToken.None).ConfigureAwait(false);
    }

    private ClientWebSocket OpenSocket() =>
        _socket ?? throw new TransportException(TransportFailure.NotConnected, "The relay socket is not connected.");
}
