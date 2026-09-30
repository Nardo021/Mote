using System.Text.Json;
using Mote.Windows.Networking;
using Mote.Windows.Protocol;

namespace Mote.Windows.Tests;

public sealed class RelaySessionTests
{
    [Fact]
    public async Task ConnectSendsWindowsAuthBeforeAnythingElse()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        var transport = harness.Current();
        var frame = transport.Sent()[0];
        using var document = JsonDocument.Parse(frame);
        var root = document.RootElement;

        Assert.Equal("/v1/ws/device", transport.ConnectedUri!.AbsolutePath);
        Assert.Equal("", transport.ConnectedUri.Query);
        Assert.DoesNotContain(SessionHarness.Credential, transport.ConnectedUri.AbsoluteUri, StringComparison.Ordinal);
        Assert.Equal("auth", root.GetProperty("type").GetString());
        Assert.Equal(1, root.GetProperty("version").GetInt32());
        Assert.Equal(SessionHarness.DeviceId, root.GetProperty("device_id").GetString());
        Assert.Equal("windows", root.GetProperty("platform").GetString());
        Assert.Equal("0.1.0", root.GetProperty("app_version").GetString());
        Assert.Equal(new[] { "lock" }, root.GetProperty("actions").EnumerateArray().Select(item => item.GetString()).ToArray());
        SecretAssert.Equal(SessionHarness.Credential, root.GetProperty("credential").GetString());
        Assert.Single(transport.Sent());
        Assert.DoesNotContain(SessionHarness.Credential, string.Join("\n", harness.Logs), StringComparison.Ordinal);
        Assert.False(harness.Client.IsAuthenticated);
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
    }

    [Fact]
    public async Task AuthSuccessEntersTheAuthenticatedPhase()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();

        Assert.True(harness.Client.IsAuthenticated);
        Assert.Equal(ConnectionPhase.Connected, harness.Client.Phase);
        Assert.Null(harness.Client.LastError);
        Assert.Contains("Authenticated", harness.Logs, StringComparer.Ordinal);
    }

    [Fact]
    public async Task AuthTimeoutReconnectsWithoutDeletingTheCredential()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        Assert.True(await harness.Delay.ReleaseWhenPending(ClientPolicy.AuthTimeout));
        await TestWait.Until(() => harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Single(harness.Transports.Snapshot());
        Assert.Equal("Authentication timed out", harness.Client.LastError);
        Assert.True(await harness.Delay.ReleaseWhenPending(TimeSpan.FromSeconds(1)));
        await TestWait.Until(() => harness.Transports.Snapshot().Length == 2);

        SecretAssert.Equal(SessionHarness.Credential, harness.Store.Value);
        Assert.False(harness.Client.IsAuthenticated);
    }

    [Theory]
    [InlineData("invalid_credentials", ConnectionPhase.Error)]
    [InlineData("unsupported_version", ConnectionPhase.Error)]
    [InlineData("device_disabled", ConnectionPhase.Disabled)]
    [InlineData("credential_rotated", ConnectionPhase.Error)]
    public async Task TerminalAuthDoesNotReconnect(string error, ConnectionPhase phase)
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        harness.Current().Enqueue(
            "{\"type\":\"auth_result\",\"version\":1,\"status\":\"error\",\"error\":\"" + error + "\"}");
        await TestWait.Until(() => harness.Client.Phase == phase);

        Assert.False(harness.Client.IsAuthenticated);
        Assert.Equal(error, harness.Client.LastError);
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Single(harness.Transports.Snapshot());
        SecretAssert.Equal(SessionHarness.Credential, harness.Store.Value);
    }

    [Theory]
    [InlineData("socket_error")]
    [InlineData("future_reason")]
    public async Task TransientCloseReconnects(string reason)
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().CloseFromRemote(reason);
        await TestWait.Until(() => harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Single(harness.Transports.Snapshot());
        Assert.True(await harness.Delay.ReleaseWhenPending(TimeSpan.FromSeconds(1)));
        await TestWait.Until(() => harness.Transports.Snapshot().Length == 2);
        Assert.True(harness.Settings.Load().Settings.WantsConnection);
    }

    [Fact]
    public async Task ExplicitDisconnectDoesNotReconnect()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.StopAsync(intentional: true);

        Assert.Equal(ConnectionPhase.Disconnected, harness.Client.Phase);
        Assert.False(harness.Client.IsAuthenticated);
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Single(harness.Transports.Snapshot());
    }

    [Fact]
    public async Task StaleGenerationCannotChangeTheCurrentSession()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var stale = harness.Client.Generation;
        harness.Current().CloseFromRemote("socket_error");
        Assert.True(await harness.Delay.ReleaseWhenPending(TimeSpan.FromSeconds(1)));
        await TestWait.Until(() => harness.Transports.Snapshot().Length == 2);
        harness.Current().Enqueue("""{"type":"auth_result","version":1,"status":"ok"}""");
        await TestWait.Until(() => harness.Client.IsAuthenticated);
        var current = harness.Transports.Snapshot()[1];
        var before = current.Sent().Length;

        await harness.Client.HandleIncomingAsync(
            stale,
            TestFrames.Command("cmd-stale", SessionHarness.DeviceId, "lock", SessionHarness.Now));

        Assert.Equal(0, harness.Workstation.Calls);
        Assert.Equal(before, current.Sent().Length);
        Assert.True(harness.Client.Generation > stale);
    }
}
