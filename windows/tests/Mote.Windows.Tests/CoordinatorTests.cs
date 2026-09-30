using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

public sealed class CoordinatorTests : IDisposable
{
    private readonly string _directory = Directory.CreateTempSubdirectory("mote-w2-agent").FullName;

    [Fact]
    public async Task StartupWithoutConnectionIntentDoesNotReadOrLock()
    {
        var workstation = new FakeWorkstationLock();
        var credentials = new MemoryCredentialStore { Value = "stored-credential" };
        var agent = Create(workstation, credentials, wantsConnection: false, relayUrl: "http://127.0.0.1:8787");

        await agent.StartAsync();
        await agent.ShutdownAsync();

        Assert.Equal(0, workstation.Calls);
        Assert.Equal(0, credentials.Reads);
    }

    [Fact]
    public async Task MissingCredentialStaysUnconfigured()
    {
        var transports = new ScriptedTransportFactory();
        var credentials = new MemoryCredentialStore();
        var agent = Create(new FakeWorkstationLock(), credentials, wantsConnection: true, relayUrl: null, transports);

        await agent.StartAsync();

        Assert.Empty(transports.Snapshot());
        Assert.Equal(1, credentials.Reads);
        Assert.False(agent.Relay.IsAuthenticated);
        await agent.ShutdownAsync();
    }

    [Fact]
    public async Task ConfiguredStartupStartsTheRelayWithoutLocking()
    {
        var transports = new ScriptedTransportFactory();
        var workstation = new FakeWorkstationLock();
        var credentials = new MemoryCredentialStore { Value = "stored-credential" };
        var agent = Create(workstation, credentials, wantsConnection: true, relayUrl: "http://127.0.0.1:8787", transports);

        await agent.StartAsync();
        await TestWait.Until(() => transports.Snapshot().Length == 1);

        Assert.Equal(0, workstation.Calls);
        Assert.Contains("\"platform\":\"windows\"", transports.Snapshot()[0].Sent()[0], StringComparison.Ordinal);
        await agent.ShutdownAsync();
    }

    [Fact]
    public async Task ExplicitDisconnectClearsConnectionIntent()
    {
        var transports = new ScriptedTransportFactory();
        var (agent, settings) = CreateWithSettings(
            new FakeWorkstationLock(),
            new MemoryCredentialStore { Value = "stored-credential" },
            wantsConnection: true,
            relayUrl: "http://127.0.0.1:8787",
            transports);
        await agent.StartAsync();
        await TestWait.Until(() => transports.Snapshot().Length == 1);

        await agent.DisconnectAsync();

        Assert.False(settings.Load().Settings.WantsConnection);
        Assert.Equal(ConnectionPhase.Disconnected, agent.Relay.Phase);
        Assert.Single(transports.Snapshot());
        await agent.ShutdownAsync();
    }

    [Fact]
    public async Task CredentialReadFailureDoesNotCrashStartup()
    {
        var credentials = new MemoryCredentialStore { FailRead = true };
        var agent = Create(new FakeWorkstationLock(), credentials, wantsConnection: true, relayUrl: "http://127.0.0.1:8787");

        await agent.StartAsync();
        await agent.ShutdownAsync();

        Assert.Equal(1, credentials.Reads);
    }

    public void Dispose()
    {
        Directory.Delete(_directory, recursive: true);
    }

    private AgentCoordinator Create(
        FakeWorkstationLock workstation,
        MemoryCredentialStore credentials,
        bool wantsConnection,
        string? relayUrl,
        ScriptedTransportFactory? transports = null) =>
        CreateWithSettings(workstation, credentials, wantsConnection, relayUrl, transports).Agent;

    private (AgentCoordinator Agent, SettingsStore Settings) CreateWithSettings(
        FakeWorkstationLock workstation,
        MemoryCredentialStore credentials,
        bool wantsConnection,
        string? relayUrl,
        ScriptedTransportFactory? transports = null)
    {
        var settings = new SettingsStore(
            Path.Combine(_directory, Guid.NewGuid().ToString("N") + ".json"),
            () => "77777777-7777-4777-8777-777777777777",
            () => "Test-PC");
        settings.Save(new AppSettings
        {
            DeviceId = "77777777-7777-4777-8777-777777777777",
            DeviceName = "Test-PC",
            RelayUrl = relayUrl,
            WantsConnection = wantsConnection,
        });
        var agent = new AgentCoordinator(
            settings,
            credentials,
            workstation,
            (transports ?? new ScriptedTransportFactory()).Create,
            new FakePairingApi(),
            new ManualDelay(),
            new ReconnectPolicy(() => 0));
        return (agent, settings);
    }
}
