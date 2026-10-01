using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using Mote.Windows.Networking;

namespace Mote.Windows.Tests;

public sealed class WebSocketTransportTests
{
    [Fact(Timeout = 15000)]
    public async Task CloseReturnsWhenThePeerNeverCompletesTheHandshake()
    {
        using var listener = new HttpListener();
        using var hold = new CancellationTokenSource();
        var port = GetFreePort();
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();
        var accepted = AcceptAndHoldAsync(listener, hold.Token);

        await using var transport = new WebSocketTransport();
        await transport.ConnectAsync(new Uri($"ws://127.0.0.1:{port}/"), CancellationToken.None);

        var watch = Stopwatch.StartNew();
        await transport.CloseAsync("client_close", CancellationToken.None);
        watch.Stop();

        Assert.InRange(watch.Elapsed, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(8));
        hold.Cancel();
        listener.Stop();
        await accepted;
    }

    private static int GetFreePort()
    {
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static async Task AcceptAndHoldAsync(HttpListener listener, CancellationToken cancellationToken)
    {
        HttpListenerContext context;
        try
        {
            context = await listener.GetContextAsync();
        }
        catch (HttpListenerException)
        {
            return;
        }
        catch (ObjectDisposedException)
        {
            return;
        }

        var socket = await context.AcceptWebSocketAsync(subProtocol: null);
        try
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // The assertion finished. Drop the peer without a close frame.
        }
        finally
        {
            socket.WebSocket.Abort();
            socket.WebSocket.Dispose();
        }
    }
}
