using System.IO;
using System.Net.WebSockets;

namespace Mote.Windows.Networking;

public sealed class WebSocketTransport : IMessageTransport, IAsyncDisposable
{
    internal static readonly TimeSpan CloseHandshakeBudget = TimeSpan.FromSeconds(2);

    internal static readonly TimeSpan IoBudget = TimeSpan.FromSeconds(8);

    private ClientWebSocket? _socket;

    public async Task ConnectAsync(Uri uri, CancellationToken cancellationToken)
    {
        await CloseAsync(reason: null, cancellationToken).ConfigureAwait(false);
        var socket = new ClientWebSocket();
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(IoBudget);
        try
        {
            await socket.ConnectAsync(uri, budget.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            socket.Dispose();
            throw new TransportException(TransportFailure.Closed, "The relay connection timed out.");
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
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(IoBudget);
        try
        {
            await socket.SendAsync(payload, WebSocketMessageType.Text, endOfMessage: true, budget.Token)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TransportException(TransportFailure.Closed, "The relay connection timed out.");
        }
    }

    public async Task<byte[]> ReceiveAsync(CancellationToken cancellationToken)
    {
        var socket = OpenSocket();
        using var buffer = new MemoryStream();
        var chunk = new byte[8 * 1024];
        while (true)
        {
            WebSocketReceiveResult result;
            try
            {
                result = await socket.ReceiveAsync(chunk, cancellationToken).ConfigureAwait(false);
            }
            catch (WebSocketException)
            {
                throw new TransportException(
                    TransportFailure.Closed,
                    "The relay socket closed.",
                    RelayCloseReason.SocketError);
            }

            if (result.MessageType == WebSocketMessageType.Close)
            {
                throw new TransportException(
                    TransportFailure.Closed,
                    "The relay socket closed.",
                    socket.CloseStatusDescription);
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

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(CloseHandshakeBudget);
        try
        {
            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, reason, budget.Token)
                    .ConfigureAwait(false);
            }
        }
        catch (Exception exception) when (exception is WebSocketException or OperationCanceledException or ObjectDisposedException)
        {
            // A peer that never finishes the close handshake must not block pairing or disconnect.
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
