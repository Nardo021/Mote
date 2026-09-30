using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Storage;
using Mote.Windows.Ui;

namespace Mote.Windows.Tests;

public sealed class DesktopExperienceTests
{
    [Fact]
    public void TrayMenuMapsStatusAndTheConnectionToggle()
    {
        var connected = TrayMenuModel.From(ConnectionPhase.Connected, null, wantsConnection: true, hasCredential: true, busy: false);
        Assert.Equal("Mote — Connected", connected.StatusText);
        Assert.Equal("Disconnect", connected.ToggleText);
        Assert.True(connected.OffersDisconnect);

        var disconnected = TrayMenuModel.From(ConnectionPhase.Disconnected, null, wantsConnection: false, hasCredential: true, busy: false);
        Assert.Equal("Mote — Disconnected", disconnected.StatusText);
        Assert.Equal("Connect", disconnected.ToggleText);

        var offline = TrayMenuModel.From(ConnectionPhase.NetworkUnavailable, null, wantsConnection: true, hasCredential: true, busy: false);
        Assert.Equal("Mote — Network unavailable", offline.StatusText);
        Assert.Equal("Disconnect", offline.ToggleText);

        var attention = TrayMenuModel.From(ConnectionPhase.Error, "invalid_credentials", wantsConnection: true, hasCredential: true, busy: false);
        Assert.Equal("Mote — Needs attention", attention.StatusText);
        Assert.Equal("Connect", attention.ToggleText);

        var disabled = TrayMenuModel.From(ConnectionPhase.Disabled, "device_disabled", wantsConnection: true, hasCredential: true, busy: false);
        Assert.Equal("Mote — Disabled", disabled.StatusText);
        Assert.Equal("Connect", disabled.ToggleText);

        Assert.Equal("Not configured", StatusCopy.TrayLabel(ConnectionPhase.NotConfigured, null));
        Assert.Equal("Connecting", StatusCopy.TrayLabel(ConnectionPhase.Connecting, null));
        Assert.Equal("Authenticating", StatusCopy.TrayLabel(ConnectionPhase.Authenticating, null));
        Assert.Equal("Reconnecting", StatusCopy.TrayLabel(ConnectionPhase.Reconnecting, null));
    }

    [Fact]
    public void StatusCopyUsesSentencesInsteadOfProtocolNames()
    {
        Assert.Equal("Relay is not configured.", StatusCopy.Headline(ConnectionPhase.NotConfigured, null));
        Assert.Equal("Disconnected.", StatusCopy.Headline(ConnectionPhase.Disconnected, null));
        Assert.Equal("Network unavailable.", StatusCopy.Headline(ConnectionPhase.NetworkUnavailable, null));
        Assert.Equal("Connecting…", StatusCopy.Headline(ConnectionPhase.Connecting, null));
        Assert.Equal("Authenticating…", StatusCopy.Headline(ConnectionPhase.Authenticating, null));
        Assert.Equal("Connected and ready.", StatusCopy.Headline(ConnectionPhase.Connected, null));
        Assert.Equal("Reconnecting…", StatusCopy.Headline(ConnectionPhase.Reconnecting, null));
        Assert.Equal("The device credential is no longer valid.", StatusCopy.Headline(ConnectionPhase.Error, "invalid_credentials"));
        Assert.Equal("A new device credential is required.", StatusCopy.Headline(ConnectionPhase.Error, "credential_rotated"));
        Assert.Equal("This version of Mote is not compatible with the Relay.", StatusCopy.Headline(ConnectionPhase.Error, "unsupported_version"));
        Assert.Equal("This device is disabled in the Mote Dashboard.", StatusCopy.Headline(ConnectionPhase.Disabled, "device_disabled"));
        Assert.Equal("Creating a pairing request…", PairingCopy.For(PairingPhase.CreatingRequest, null));
        Assert.Equal("Connecting to the Relay…", PairingCopy.For(PairingPhase.Connecting, null));
        Assert.Equal("Confirming the pairing request…", PairingCopy.For(PairingPhase.Authenticating, null));
        Assert.Equal("Waiting for approval in the Mote Dashboard.", PairingCopy.For(PairingPhase.PendingApproval, null));
        Assert.Equal("Paired.", PairingCopy.For(PairingPhase.Approved, null));
        Assert.Equal("Pairing was declined in the Dashboard.", PairingCopy.For(PairingPhase.Rejected, null));
        Assert.Equal("The pairing request expired.", PairingCopy.For(PairingPhase.Expired, null));
        Assert.Equal("Pairing cancelled.", PairingCopy.For(PairingPhase.Cancelled, null));
        Assert.Equal("Pairing failed.", PairingCopy.For(PairingPhase.Failed, "pair_auth"));
        Assert.False(StatusCopy.OffersCredentialReplacement(ConnectionPhase.Error, "unsupported_version"));
        Assert.False(StatusCopy.OffersCredentialReplacement(ConnectionPhase.Disabled, "device_disabled"));
        Assert.True(StatusCopy.OffersCredentialReplacement(ConnectionPhase.Error, "invalid_credentials"));
        Assert.True(StatusCopy.OffersCredentialReplacement(ConnectionPhase.Error, "credential_rotated"));
    }

    [Fact]
    public async Task TrayCommandsOpenConnectDisconnectAndQuit()
    {
        using var desktop = new UiFixture(wantsConnection: false);
        await desktop.Host.StartAsync();
        desktop.Session.Start(showSettings: false);

        desktop.Tray.Open();
        Assert.True(desktop.Presenter.IsOpen);
        Assert.Equal(1, desktop.Session.SettingsActivations);

        desktop.Tray.Connect();
        await TestWait.Until(() => desktop.Settings.Load().Settings.WantsConnection);
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);

        desktop.Model.ProjectLiveState();
        desktop.Tray.Disconnect();
        await TestWait.Until(() => !desktop.Settings.Load().Settings.WantsConnection);
        Assert.Equal(ConnectionPhase.Disconnected, desktop.Host.Agent.Relay.Phase);

        desktop.Tray.Quit();
        await TestWait.Until(() => desktop.Session.HasQuit && desktop.Tray.IsDisposed);
        Assert.False(desktop.Host.Agent.IsRunning);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection == false);
    }

    [Fact]
    public async Task ClosingSettingsHidesTheWindowAndLeavesTheAgentRunning()
    {
        using var desktop = new UiFixture();
        await desktop.Host.StartAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Session.Start(showSettings: true);
        desktop.Session.ShowSettings();

        var attempts = desktop.Transports.Snapshot().Length;
        desktop.Session.RequestCloseSettings();

        Assert.False(desktop.Presenter.IsOpen);
        Assert.False(desktop.Session.SettingsVisible);
        Assert.True(desktop.Host.Agent.IsRunning);
        Assert.False(desktop.Tray.IsDisposed);
        Assert.Equal(attempts, desktop.Transports.Snapshot().Length);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection);
    }

    [Fact]
    public async Task QuitPreservesConnectionIntent()
    {
        using var desktop = new UiFixture();
        await desktop.Host.StartAsync();
        desktop.Session.Start(showSettings: false);

        await desktop.Session.QuitAsync();

        Assert.True(desktop.Session.HasQuit);
        Assert.True(desktop.Tray.IsDisposed);
        Assert.False(desktop.Host.Agent.IsRunning);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection);
    }
}

internal sealed class UiFixture : IDisposable
{
    public const string DeviceId = "77777777-7777-4777-8777-777777777777";

    private readonly string _directory;

    public UiFixture(bool wantsConnection = true, string? credential = "stored-credential", string? relayUrl = "http://127.0.0.1:8787")
    {
        _directory = Directory.CreateTempSubdirectory("mote-w5").FullName;
        SettingsFile = Path.Combine(_directory, "settings.json");
        Settings = new SettingsStore(SettingsFile, () => DeviceId, () => "Test-PC");
        Settings.Save(new AppSettings
        {
            DeviceId = DeviceId,
            DeviceName = "Test-PC",
            RelayUrl = relayUrl,
            WantsConnection = wantsConnection,
        });
        Credentials = new MemoryCredentialStore { Value = credential };
        Transports = new ScriptedTransportFactory();
        Pairing = new FakePairingApi();
        StartupStore = new MemoryStartupStore();
        Startup = new PerUserStartupService(LaunchCommand.Format(@"C:\Mote\Mote.Windows.exe"), StartupStore);
        Host = new AgentHost(Settings, Credentials, new FakeWorkstationLock(), Transports.Create, Pairing);
        Model = new SettingsViewModel(Host.Agent, Settings, Startup, launchAtLoginAvailable: true, "0.1.0");
        Tray = new FakeTray();
        Presenter = new FakePresenter();
        Instance = AppInstance.Acquire("Mote.Test." + Guid.NewGuid().ToString("N"), requestSettings: false);
        Session = new DesktopSession(Host, Model, Tray, Instance, Presenter);
    }

    public string SettingsFile { get; }

    public SettingsStore Settings { get; }

    public MemoryCredentialStore Credentials { get; }

    public ScriptedTransportFactory Transports { get; }

    public FakePairingApi Pairing { get; }

    public MemoryStartupStore StartupStore { get; }

    public PerUserStartupService Startup { get; }

    public AgentHost Host { get; }

    public SettingsViewModel Model { get; }

    public FakeTray Tray { get; }

    public FakePresenter Presenter { get; }

    public AppInstance Instance { get; }

    public DesktopSession Session { get; }

    public void Dispose()
    {
        if (!Session.HasQuit)
        {
            Session.QuitAsync().GetAwaiter().GetResult();
        }

        Directory.Delete(_directory, recursive: true);
    }
}

internal sealed class FakeTray : ITraySurface
{
    public TrayMenuModel? Model { get; private set; }

    public bool IsDisposed { get; private set; }

    public event EventHandler? OpenRequested;

    public event EventHandler? ConnectRequested;

    public event EventHandler? DisconnectRequested;

    public event EventHandler? QuitRequested;

    public void Apply(TrayMenuModel model) => Model = model;

    public void Open() => OpenRequested?.Invoke(this, EventArgs.Empty);

    public void Connect() => ConnectRequested?.Invoke(this, EventArgs.Empty);

    public void Disconnect() => DisconnectRequested?.Invoke(this, EventArgs.Empty);

    public void Quit() => QuitRequested?.Invoke(this, EventArgs.Empty);

    public void Dispose() => IsDisposed = true;
}

internal sealed class FakePresenter : ISettingsPresenter
{
    public bool IsOpen { get; private set; }

    public int Shows { get; private set; }

    public void Show()
    {
        Shows++;
        IsOpen = true;
    }

    public void Hide() => IsOpen = false;

    public void AllowShutdown()
    {
    }
}
