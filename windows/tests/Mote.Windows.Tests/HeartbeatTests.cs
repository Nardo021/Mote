using Mote.Windows.Networking;

namespace Mote.Windows.Tests;

public sealed class HeartbeatTests
{
    [Fact]
    public async Task HeartbeatStartsOnlyAfterAuthAndRepeatsOnTheClientInterval()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        Assert.Equal(0, harness.HeartbeatCount());
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));

        await harness.AuthenticateAsync();
        Assert.Equal(0, harness.HeartbeatCount());
        Assert.Equal(1, harness.Delay.CountPending(ClientPolicy.HeartbeatInterval));
        Assert.True(await harness.Delay.ReleaseWhenPending(ClientPolicy.HeartbeatInterval));
        await TestWait.Until(() => harness.HeartbeatCount() == 1);
        Assert.True(await harness.Delay.ReleaseWhenPending(ClientPolicy.HeartbeatInterval));
        await TestWait.Until(() => harness.HeartbeatCount() == 2);
        Assert.Equal(ClientPolicy.HeartbeatInterval, TimeSpan.FromSeconds(30));
    }

    [Fact]
    public async Task DisconnectCancelsHeartbeat()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await TestWait.Until(() => harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        await harness.Client.StopAsync(intentional: true);

        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        Assert.Equal(0, harness.HeartbeatCount());
    }

    [Fact]
    public async Task ReconnectDoesNotDuplicateHeartbeat()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await TestWait.Until(() => harness.Delay.CountPending(ClientPolicy.HeartbeatInterval) == 1);
        harness.Current().CloseFromRemote("socket_error");
        Assert.True(await harness.Delay.ReleaseWhenPending(TimeSpan.FromSeconds(1)));
        await TestWait.Until(() => harness.Transports.Snapshot().Length == 2);
        harness.Current().Enqueue("""{"type":"auth_result","version":1,"status":"ok"}""");
        await TestWait.Until(() => harness.Client.IsAuthenticated && harness.Delay.CountPending(ClientPolicy.HeartbeatInterval) == 1);

        Assert.True(await harness.Delay.ReleaseWhenPending(ClientPolicy.HeartbeatInterval));
        await TestWait.Until(() => harness.HeartbeatCount() == 1);
    }

    [Fact]
    public async Task StaleGenerationCannotSendHeartbeat()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var generation = harness.Client.Generation;
        await harness.Client.SendHeartbeatForTestAsync(generation - 1);

        Assert.Equal(0, harness.HeartbeatCount());
        harness.Current().CloseFromRemote(null);
        Assert.True(await harness.Delay.ReleaseWhenPending(TimeSpan.FromSeconds(1)));
        await TestWait.Until(() => harness.Transports.Snapshot().Length == 2);
        await harness.Client.SendHeartbeatForTestAsync(generation);
        Assert.Equal(0, harness.HeartbeatCount());
    }

    [Fact]
    public async Task HeartbeatAckIsParsed()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var sentAt = SessionHarness.Now - 100;
        harness.Current().Enqueue(
            "{\"type\":\"heartbeat_ack\",\"version\":1,\"sent_at\":" + sentAt + ",\"server_at\":" + SessionHarness.Now + "}");
        await TestWait.Until(() => harness.Client.HeartbeatRoundTripMilliseconds == 100);
        Assert.Equal(0, harness.HeartbeatCount());
    }
}
