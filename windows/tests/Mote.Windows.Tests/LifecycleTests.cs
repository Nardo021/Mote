using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

public sealed class LifecycleTests : IDisposable
{
    private const string AuthOk = """{"type":"auth_result","version":1,"status":"ok"}""";

    private readonly string _directory = Directory.CreateTempSubdirectory("mote-w4").FullName;

    [Fact]
    public async Task StartupWithoutNetworkDoesNotConnect()
    {
        using var harness = new SessionHarness();
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.StartAsync();

        Assert.Empty(harness.Transports.Snapshot());
        Assert.Equal(ConnectionPhase.NetworkUnavailable, harness.Client.Phase);
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.True(harness.Settings.Load().Settings.WantsConnection);
        SecretAssert.Equal(SessionHarness.Credential, harness.Store.Value);
    }

    [Fact]
    public async Task NetworkRestorationAttemptsExactlyOneConnection()
    {
        using var harness = new SessionHarness();
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.StartAsync();

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));
        Assert.Equal(ConnectionPhase.Authenticating, harness.Client.Phase);
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public async Task NetworkLossInvalidatesTheConnectionWithoutReconnect()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await TestWait.Until(() => harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        var generation = harness.Client.Generation;
        var socket = harness.Current();

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);

        Assert.True(generation < harness.Client.Generation);
        Assert.True(socket.IsClosed);
        Assert.False(harness.Client.IsAuthenticated);
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Equal(ConnectionPhase.NetworkUnavailable, harness.Client.Phase);
        Assert.Equal(1, Count(harness));
        Assert.Equal(0, harness.HeartbeatCount());
        Assert.True(harness.Settings.Load().Settings.WantsConnection);
        Assert.Equal(SessionHarness.DeviceId, harness.Settings.Load().Settings.DeviceId);
        Assert.Equal("http://127.0.0.1:8787", harness.Settings.Load().Settings.RelayUrl);
        SecretAssert.Equal(SessionHarness.Credential, harness.Store.Value);
        Assert.DoesNotContain(SessionHarness.Credential, string.Join('\n', harness.Logs), StringComparison.Ordinal);
        var settingsText = File.ReadAllText(Path.Combine(harness.DirectoryPath, "settings.json"));
        Assert.DoesNotContain(SessionHarness.Credential, settingsText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task NetworkRestorationAfterLossOpensOneFreshGeneration()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var generation = harness.Client.Generation;

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(2, Count(harness));
        Assert.True(generation < harness.Client.Generation);
        Assert.False(harness.Client.IsAuthenticated);
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        Assert.Equal(1, harness.Logs.Count(line => line == "Immediate reconnect"));
    }

    [Fact]
    public async Task RepeatedNetworkLossDoesNotInvalidateAgain()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        var generation = harness.Client.Generation;

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);

        Assert.Equal(generation, harness.Client.Generation);
        Assert.Equal(1, Count(harness));
        Assert.Equal(1, harness.Logs.Count(line => line == "Network unavailable"));
        Assert.Equal(1, harness.Logs.Count(line => line == "Transport invalidated"));
    }

    [Fact]
    public async Task RepeatedNetworkAvailableDoesNotConnectAgain()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));
        Assert.True(harness.Client.IsAuthenticated);
        Assert.Equal(ConnectionPhase.Connected, harness.Client.Phase);
        Assert.DoesNotContain("Network restored", harness.Logs);
    }

    [Fact]
    public async Task NetworkRestoredWhileConnectingDoesNotDuplicateTheAttempt()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        Assert.Equal(ConnectionPhase.Authenticating, harness.Client.Phase);

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));
        Assert.Equal(ConnectionPhase.Authenticating, harness.Client.Phase);
    }

    [Fact]
    public async Task NetworkRestoredWhileAuthenticatedDoesNotDuplicateTheAttempt()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));
        Assert.True(harness.Client.IsAuthenticated);
    }

    [Fact]
    public async Task StaleCloseAfterNetworkRestoreCannotAffectTheNewGeneration()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var stale = harness.Current();
        var generation = harness.Client.Generation;
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        harness.Current().Enqueue(AuthOk);
        await TestWait.Until(() => harness.Client.IsAuthenticated);

        stale.CloseFromRemote("socket_error");
        await Task.Delay(50);

        Assert.True(harness.Client.IsAuthenticated);
        Assert.Equal(ConnectionPhase.Connected, harness.Client.Phase);
        Assert.Equal(2, Count(harness));
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.True(generation < harness.Client.Generation);
    }

    [Fact]
    public async Task StaleAuthResultAfterNetworkRestoreCannotAffectTheNewGeneration()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var generation = harness.Client.Generation;
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        harness.Current().Enqueue(AuthOk);
        await TestWait.Until(() => harness.Client.IsAuthenticated);

        await harness.Client.HandleIncomingAsync(
            generation,
            "{\"type\":\"auth_result\",\"version\":1,\"status\":\"error\",\"error\":\"invalid_credentials\"}");

        Assert.True(harness.Client.IsAuthenticated);
        Assert.Equal(ConnectionPhase.Connected, harness.Client.Phase);
        Assert.Null(harness.Client.LastError);
    }

    [Fact]
    public async Task StaleHeartbeatAfterNetworkRestoreCannotSend()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var generation = harness.Client.Generation;
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        await harness.Client.SendHeartbeatForTestAsync(generation);

        Assert.Equal(0, harness.HeartbeatCount());
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
    }

    [Fact]
    public async Task NetworkLossCancelsAScheduledReconnectAndRestorationConnectsImmediately()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().CloseFromRemote("socket_error");
        await TestWait.Until(() => harness.Delay.IsPending(TimeSpan.FromSeconds(1)));

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);

        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Equal(1, Count(harness));

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        await Settle();

        Assert.Equal(2, Count(harness));
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Equal(1, harness.Logs.Count(line => line == "Immediate reconnect"));
    }

    [Fact]
    public async Task SuspendStopsTheSessionWithoutReconnect()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await TestWait.Until(() => harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        var socket = harness.Current();

        await harness.Client.NotePowerAsync(PowerTransition.Suspend);

        Assert.True(socket.IsClosed);
        Assert.False(harness.Client.IsAuthenticated);
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Equal(ConnectionPhase.Disconnected, harness.Client.Phase);
        Assert.Equal(1, Count(harness));
        Assert.True(harness.Settings.Load().Settings.WantsConnection);
        SecretAssert.Equal(SessionHarness.Credential, harness.Store.Value);
    }

    [Fact]
    public async Task ResumeWithNetworkConnectsOnce()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);

        await harness.Client.NotePowerAsync(PowerTransition.Resume);

        Assert.Equal(2, Count(harness));
        Assert.False(harness.Client.IsAuthenticated);
        Assert.False(harness.Delay.IsPending(ClientPolicy.HeartbeatInterval));
        Assert.Equal(1, harness.Logs.Count(line => line == "Immediate reconnect"));
    }

    [Fact]
    public async Task RepeatedResumeDoesNotConnectAgain()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await Settle();

        Assert.Equal(2, Count(harness));
        Assert.Equal(1, harness.Logs.Count(line => line == "System resume"));
    }

    [Fact]
    public async Task SuspendWhileConnectingCancelsThatGeneration()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        var generation = harness.Client.Generation;

        await harness.Client.NotePowerAsync(PowerTransition.Suspend);

        Assert.True(generation < harness.Client.Generation);
        Assert.True(harness.Current().IsClosed);
        Assert.False(harness.Delay.IsPending(ClientPolicy.AuthTimeout));
        Assert.False(harness.Client.IsAuthenticated);

        await harness.Client.HandleIncomingAsync(generation, AuthOk);

        Assert.False(harness.Client.IsAuthenticated);
    }

    [Fact]
    public async Task StaleAuthResultAfterSuspendIsIgnored()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        var generation = harness.Client.Generation;
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        harness.Current().Enqueue(AuthOk);
        await TestWait.Until(() => harness.Client.IsAuthenticated);

        await harness.Client.HandleIncomingAsync(
            generation,
            "{\"type\":\"auth_result\",\"version\":1,\"status\":\"error\",\"error\":\"invalid_credentials\"}");

        Assert.True(harness.Client.IsAuthenticated);
        Assert.Equal(ConnectionPhase.Connected, harness.Client.Phase);
    }

    [Fact]
    public async Task StaleCloseAfterResumeCannotAffectTheNewGeneration()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var stale = harness.Current();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        harness.Current().Enqueue(AuthOk);
        await TestWait.Until(() => harness.Client.IsAuthenticated);

        stale.CloseFromRemote("socket_error");
        await Settle();

        Assert.True(harness.Client.IsAuthenticated);
        Assert.Equal(2, Count(harness));
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public async Task ExplicitDisconnectSurvivesSuspendAndResume()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var settings = harness.Settings.Load().Settings;
        harness.Settings.Save(settings with { WantsConnection = false });
        await harness.Client.StopAsync(intentional: true);

        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        await Settle();

        Assert.Equal(ConnectionPhase.Disconnected, harness.Client.Phase);
        Assert.Equal(1, Count(harness));
        Assert.False(harness.Settings.Load().Settings.WantsConnection);
    }

    [Fact]
    public async Task TerminalStateSurvivesSuspendAndNetworkChanges()
    {
        using var harness = new SessionHarness();
        await harness.ConnectAsync();
        harness.Current().Enqueue(
            "{\"type\":\"auth_result\",\"version\":1,\"status\":\"error\",\"error\":\"invalid_credentials\"}");
        await TestWait.Until(() => harness.Client.Phase == ConnectionPhase.Error);

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await Settle();

        Assert.Equal(ConnectionPhase.Error, harness.Client.Phase);
        Assert.Equal("invalid_credentials", harness.Client.LastError);
        Assert.Equal(1, Count(harness));
        SecretAssert.Equal(SessionHarness.Credential, harness.Store.Value);
    }

    [Fact]
    public async Task SuspendThenNetworkChangesDoNotReconnectUntilResume()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));
        Assert.NotEqual(ConnectionPhase.Reconnecting, harness.Client.Phase);

        await harness.Client.NotePowerAsync(PowerTransition.Resume);

        Assert.Equal(2, Count(harness));
    }

    [Fact]
    public async Task ResumeWhileNetworkIsUnavailableWaitsForTheNetwork()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);

        await harness.Client.NotePowerAsync(PowerTransition.Resume);

        Assert.Equal(1, Count(harness));
        Assert.Equal(ConnectionPhase.NetworkUnavailable, harness.Client.Phase);

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(2, Count(harness));
    }

    [Fact]
    public async Task NetworkAvailableWhileSuspendedReconnectsOnceOnResume()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await Settle();

        Assert.Equal(2, Count(harness));
    }

    [Fact]
    public async Task NetworkLossBeforeSuspendReconnectsOnceOnResume()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));

        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await Settle();

        Assert.Equal(2, Count(harness));
    }

    [Fact]
    public async Task StartupWithoutNetworkIgnoresSuspendUntilTheNetworkReturns()
    {
        using var harness = new SessionHarness();
        await harness.Client.NoteNetworkAsync(NetworkAvailability.Unavailable);
        await harness.Client.StartAsync();
        await harness.Client.NotePowerAsync(PowerTransition.Suspend);
        await harness.Client.NotePowerAsync(PowerTransition.Resume);

        Assert.Empty(harness.Transports.Snapshot());
        Assert.Equal(ConnectionPhase.NetworkUnavailable, harness.Client.Phase);

        await harness.Client.NoteNetworkAsync(NetworkAvailability.Available);

        Assert.Equal(1, Count(harness));
    }

    [Fact]
    public async Task SuspendCancelsAScheduledReconnectAndResumeConnectsImmediately()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().CloseFromRemote("socket_error");
        await TestWait.Until(() => harness.Delay.IsPending(TimeSpan.FromSeconds(1)));

        await harness.Client.NotePowerAsync(PowerTransition.Suspend);

        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
        Assert.Equal(1, Count(harness));

        await harness.Client.NotePowerAsync(PowerTransition.Resume);
        await Settle();

        Assert.Equal(2, Count(harness));
        Assert.False(harness.Delay.IsPending(TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public async Task CoordinatorStartsOfflineAndReconnectsWhenTheMonitorRecovers()
    {
        var network = new FakeNetworkMonitor(NetworkAvailability.Unavailable);
        var power = new FakePowerMonitor();
        var transports = new ScriptedTransportFactory();
        var (agent, _) = CreateAgent(transports, network, power);

        await agent.StartAsync();

        Assert.Empty(transports.Snapshot());
        Assert.Equal(ConnectionPhase.NetworkUnavailable, agent.Relay.Phase);

        network.Set(NetworkAvailability.Available);
        await TestWait.Until(() => transports.Snapshot().Length == 1);
        await Settle();

        var attempts = transports.Snapshot().Length;
        Assert.Equal(1, attempts);
        await agent.ShutdownAsync();
    }

    [Fact]
    public async Task ShutdownDropsMonitorSubscriptionsAndPreservesConnectionIntent()
    {
        var network = new FakeNetworkMonitor();
        var power = new FakePowerMonitor();
        var transports = new ScriptedTransportFactory();
        var delay = new ManualDelay();
        var (agent, settings) = CreateAgent(transports, network, power, delay);
        await agent.StartAsync();
        await TestWait.Until(() => transports.Snapshot().Length == 1);
        transports.Snapshot()[0].Enqueue(AuthOk);
        await TestWait.Until(() => agent.Relay.IsAuthenticated);
        await TestWait.Until(() => delay.IsPending(ClientPolicy.HeartbeatInterval));

        await agent.ShutdownAsync();
        await agent.ShutdownAsync();

        Assert.True(settings.Load().Settings.WantsConnection);
        Assert.False(agent.Relay.IsAuthenticated);
        Assert.False(delay.IsPending(ClientPolicy.HeartbeatInterval));
        Assert.Equal(1, network.DisposeCount);
        Assert.Equal(1, power.DisposeCount);

        network.Set(NetworkAvailability.Unavailable);
        network.Set(NetworkAvailability.Available);
        power.Raise(PowerTransition.Suspend);
        power.Raise(PowerTransition.Resume);
        await Settle();

        var attempts = transports.Snapshot().Length;
        Assert.Equal(1, attempts);
        Assert.Equal(ConnectionPhase.Disconnected, agent.Relay.Phase);
    }

    [Fact]
    public void ProductionMonitorsDisposeTwice()
    {
        var network = new NetworkMonitor();
        network.Dispose();
        network.Dispose();

        var power = new PowerMonitor();
        power.Dispose();
        power.Dispose();
    }

    public void Dispose()
    {
        Directory.Delete(_directory, recursive: true);
    }

    private (AgentCoordinator Agent, SettingsStore Settings) CreateAgent(
        ScriptedTransportFactory transports,
        INetworkMonitor network,
        IPowerMonitor power,
        ManualDelay? delay = null)
    {
        var settings = new SettingsStore(
            Path.Combine(_directory, Guid.NewGuid().ToString("N") + ".json"),
            () => "77777777-7777-4777-8777-777777777777",
            () => "Test-PC");
        settings.Save(new AppSettings
        {
            DeviceId = "77777777-7777-4777-8777-777777777777",
            DeviceName = "Test-PC",
            RelayUrl = "http://127.0.0.1:8787",
            WantsConnection = true,
        });
        var agent = new AgentCoordinator(
            settings,
            new MemoryCredentialStore { Value = "stored-credential" },
            new FakeWorkstationLock(),
            transports.Create,
            new FakePairingApi(),
            delay ?? new ManualDelay(),
            new ReconnectPolicy(() => 0),
            network: network,
            power: power);
        return (agent, settings);
    }

    private static int Count(SessionHarness harness) => harness.Transports.Snapshot().Length;

    private static Task Settle() => Task.Delay(50);
}

internal sealed class FakeNetworkMonitor : INetworkMonitor
{
    public FakeNetworkMonitor(NetworkAvailability availability = NetworkAvailability.Available)
    {
        Availability = availability;
    }

    public NetworkAvailability Availability { get; private set; }

    public event EventHandler<NetworkAvailability>? AvailabilityChanged;

    public int DisposeCount { get; private set; }

    public void Set(NetworkAvailability availability)
    {
        Availability = availability;
        AvailabilityChanged?.Invoke(this, availability);
    }

    public void Dispose() => DisposeCount++;
}

internal sealed class FakePowerMonitor : IPowerMonitor
{
    public event EventHandler<PowerTransition>? Transitioned;

    public int DisposeCount { get; private set; }

    public void Raise(PowerTransition transition) => Transitioned?.Invoke(this, transition);

    public void Dispose() => DisposeCount++;
}
