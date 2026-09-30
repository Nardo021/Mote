using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Protocol;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

public class BoundaryTests
{
    [Fact]
    public async Task DisconnectedTransportDoesNotOpenASocket()
    {
        await using var transport = new WebSocketTransport();

        var error = await Assert.ThrowsAsync<TransportException>(() =>
            transport.SendAsync("auth"u8.ToArray(), CancellationToken.None));

        Assert.Equal(TransportFailure.NotConnected, error.Failure);
    }

    [Fact]
    public void RelaySocketUsesTheProtocolPath()
    {
        var device = RelayAddress.DeviceWebSocket(new Uri("https://127.0.0.1"));
        var local = RelayAddress.DeviceWebSocket(new Uri("http://127.0.0.1:8787"));
        var pair = RelayAddress.PairWebSocket(new Uri("http://127.0.0.1:8787"));

        Assert.Equal("wss", device.Scheme);
        Assert.Equal(ProtocolConstants.DeviceWebSocketPath, device.AbsolutePath);
        Assert.Equal("ws", local.Scheme);
        Assert.Equal(8787, local.Port);
        Assert.Equal(ProtocolConstants.DeviceWebSocketPath, local.AbsolutePath);
        Assert.Equal(ProtocolConstants.PairWebSocketPath, pair.AbsolutePath);
        Assert.False(RelayAddress.TryParseBase(" ", out _));
        Assert.False(RelayAddress.TryParseBase("http://127.0.0.1/not a url", out _));
    }

    [Fact]
    public void WindowsAuthProfileIsLockOnly()
    {
        var settings = new AppSettings
        {
            DeviceId = "88888888-8888-4888-8888-888888888888",
            DeviceName = "Test-PC",
        };
        var client = new RelayClient(new FakeTransport());
        var auth = client.BuildAuth(settings, "device-credential", "0.1.0");
        var json = ProtocolCodec.Encode(auth);

        Assert.Equal("windows", auth.Platform);
        Assert.Equal(new[] { ProtocolConstants.ActionLock }, auth.Actions);
        Assert.Contains("\"platform\":\"windows\"", json, StringComparison.Ordinal);
        Assert.Contains("device-credential", json, StringComparison.Ordinal);
        Assert.DoesNotContain("sleep", json, StringComparison.Ordinal);
        Assert.DoesNotContain("device-credential", settings.DeviceId, StringComparison.Ordinal);
        Assert.DoesNotContain("device-credential", settings.DeviceName, StringComparison.Ordinal);
    }

    [Fact]
    public void ReconnectDelayFollowsTheClientSchedule()
    {
        var policy = new ReconnectPolicy(() => 0);

        Assert.Equal(TimeSpan.FromSeconds(1), policy.Delay(0));
        Assert.Equal(TimeSpan.FromSeconds(30), policy.Delay(100));
    }

    [Fact]
    public void PerUserStartupDoesNotTouchTheCurrentUserRegistry()
    {
        var store = new MemoryStartupStore();
        var startup = new PerUserStartupService(@"C:\Mote\Mote.Windows.exe", store);

        Assert.False(startup.IsEnabled());
        startup.SetEnabled(true);
        Assert.True(startup.IsEnabled());
        startup.SetEnabled(false);
        Assert.False(startup.IsEnabled());
        Assert.Null(store.Read("unrelated"));
    }
}

internal sealed class FakeTransport : IMessageTransport
{
    public Task ConnectAsync(Uri uri, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task SendAsync(ReadOnlyMemory<byte> payload, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task<byte[]> ReceiveAsync(CancellationToken cancellationToken) => Task.FromResult(Array.Empty<byte>());

    public Task CloseAsync(string? reason, CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class MemoryStartupStore : IStartupStore
{
    private readonly Dictionary<string, string> _values = new(StringComparer.Ordinal);

    public string? Read(string name) => _values.TryGetValue(name, out var value) ? value : null;

    public void Write(string name, string value) => _values[name] = value;

    public void Remove(string name) => _values.Remove(name);
}
