using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Ui;

namespace Mote.Windows.Tests;

public sealed class SettingsExperienceTests
{
    private const string Replacement = "replacement-credential-value";

    [Fact]
    public async Task ConnectPersistsIntentAndDisconnectClearsIt()
    {
        using var desktop = new UiFixture(wantsConnection: false);
        await desktop.Host.StartAsync();
        desktop.Model.LoadEditor();

        var connected = await desktop.Model.ConnectOrDisconnectAsync();

        Assert.Equal(ConnectResult.Started, connected);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection);
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);

        await desktop.Model.ConnectOrDisconnectAsync();

        Assert.False(desktop.Settings.Load().Settings.WantsConnection);
        Assert.Equal(ConnectionPhase.Disconnected, desktop.Host.Agent.Relay.Phase);
        SecretAssert.Equal("stored-credential", desktop.Credentials.Value);
    }

    [Fact]
    public async Task ConnectWithoutACredentialAsksForPairing()
    {
        using var desktop = new UiFixture(wantsConnection: true, credential: null);
        await desktop.Host.StartAsync();
        desktop.Model.LoadEditor();

        var result = await desktop.Model.ConnectOrDisconnectAsync();

        Assert.Equal(ConnectResult.PairingRequired, result);
        Assert.Equal("Pair this device before connecting.", desktop.Model.Notice);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection);
        Assert.Empty(desktop.Transports.Snapshot());
        Assert.True(desktop.Model.ShowPair);
    }

    [Fact]
    public async Task SavingARelayUrlRestartsTheSessionAndKeepsIdentity()
    {
        using var desktop = new UiFixture();
        await desktop.Host.StartAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Model.LoadEditor();
        desktop.Model.RelayUrlText = "http://127.0.0.1:8788";

        await desktop.Model.SaveRelayUrlAsync();

        var sockets = desktop.Transports.Snapshot();
        var opened = sockets.Length;
        Assert.Equal(2, opened);
        Assert.Contains("8788", sockets[1].ConnectedUri?.AbsoluteUri, StringComparison.Ordinal);
        Assert.True(sockets[0].IsClosed);
        Assert.Equal(UiFixture.DeviceId, desktop.Settings.Load().Settings.DeviceId);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection);
        SecretAssert.Equal("stored-credential", desktop.Credentials.Value);
        Assert.False(File.ReadAllText(desktop.SettingsFile).Contains("stored-credential", StringComparison.Ordinal));
    }

    [Fact]
    public async Task NetworkLossProjectsTheUnavailableState()
    {
        using var desktop = new UiFixture();
        await desktop.Host.StartAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        await desktop.Host.Agent.Relay.NoteNetworkAsync(NetworkAvailability.Unavailable);
        desktop.Model.ProjectLiveState();

        Assert.Equal(ConnectionPhase.NetworkUnavailable, desktop.Host.Agent.Relay.Phase);
        Assert.Equal("Network unavailable.", desktop.Model.Headline);
        var tray = TrayMenuModel.From(
            desktop.Host.Agent.Relay.Phase,
            desktop.Host.Agent.Relay.LastError,
            desktop.Model.WantsConnection,
            desktop.Model.HasCredential,
            busy: false);
        Assert.Equal("Mote — Network unavailable", tray.StatusText);
    }

    [Theory]
    [InlineData("invalid_credentials", true, false, false)]
    [InlineData("credential_rotated", true, false, false)]
    [InlineData("unsupported_version", false, true, false)]
    [InlineData("device_disabled", false, false, true)]
    public async Task TerminalStatesUseDistinctRecovery(string error, bool replacement, bool compatibility, bool disabled)
    {
        using var desktop = new UiFixture();
        await desktop.Host.StartAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Transports.Snapshot()[0].Enqueue(
            "{\"type\":\"auth_result\",\"version\":1,\"status\":\"error\",\"error\":\"" + error + "\"}");
        await TestWait.Until(() => desktop.Host.Agent.Relay.Phase is ConnectionPhase.Error or ConnectionPhase.Disabled);
        desktop.Model.RefreshCredential();
        desktop.Model.ProjectLiveState();

        Assert.Equal(replacement, desktop.Model.ShowCredentialReplacement);
        Assert.Equal(compatibility, desktop.Model.ShowCompatibilityHelp);
        Assert.Equal(disabled, desktop.Model.ShowDisabledHelp);
        Assert.NotEqual(error, desktop.Model.Headline);
        Assert.False(desktop.Model.Headline.Contains(error, StringComparison.Ordinal));
    }

    [Fact]
    public async Task PairingWaitsForDashboardApprovalAndCancelUsesTheClient()
    {
        using var desktop = new UiFixture(credential: null);
        await desktop.Host.StartAsync();
        desktop.Model.LoadEditor();
        Assert.True(desktop.Model.ShowPair);

        var pairing = desktop.Model.PairAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Transports.Snapshot()[0].Enqueue("""{"type":"pair_pending","version":1}""");
        await TestWait.Until(() => desktop.Host.Agent.Pairing.Phase == PairingPhase.PendingApproval);
        desktop.Model.ProjectLiveState();

        Assert.Equal("Waiting for approval in the Mote Dashboard.", desktop.Model.PairingMessage);
        Assert.True(desktop.Model.PairingActive);
        desktop.Session.RequestCloseSettings();
        await Task.Delay(40);
        Assert.Equal(0, desktop.Pairing.CancelCalls);
        Assert.Equal(PairingPhase.PendingApproval, desktop.Host.Agent.Pairing.Phase);

        await desktop.Model.CancelPairingAsync();
        await pairing;

        Assert.Equal(PairingPhase.Cancelled, desktop.Host.Agent.Pairing.Phase);
        Assert.Equal(1, desktop.Pairing.CancelCalls);
        Assert.Equal("req-1", desktop.Pairing.CancelRequestIds[0]);
        Assert.Null(desktop.Credentials.Value);
        Assert.False(desktop.Model.HasCredential);
    }

    [Fact]
    public async Task ApprovedPairingShowsPairedWithoutDisplayingTheCredential()
    {
        using var desktop = new UiFixture(credential: null);
        await desktop.Host.StartAsync();
        desktop.Model.LoadEditor();
        var pairing = desktop.Model.PairAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Transports.Snapshot()[0].Enqueue(
            "{\"type\":\"pair_approved\",\"version\":1,\"device_id\":\"" + UiFixture.DeviceId
            + "\",\"credential\":\"" + Replacement + "\",\"name\":\"Test-PC\"}");
        await pairing;
        desktop.Model.ProjectLiveState();
        Assert.True(desktop.Model.HasCredential);
        Assert.Equal("Paired", desktop.Model.PairedLabel);
        Assert.Equal("Paired.", desktop.Model.Notice);
        Assert.False(string.Join('\n', desktop.Model.VisibleText()).Contains(Replacement, StringComparison.Ordinal));
        Assert.False(File.ReadAllText(desktop.SettingsFile).Contains(Replacement, StringComparison.Ordinal));
        SecretAssert.Equal(Replacement, desktop.Credentials.Value);
    }

    [Fact]
    public async Task RejectedPairingStaysUnpaired()
    {
        using var desktop = new UiFixture(credential: null);
        await desktop.Host.StartAsync();
        desktop.Model.LoadEditor();
        var pairing = desktop.Model.PairAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Transports.Snapshot()[0].Enqueue("""{"type":"pair_rejected","version":1,"error":"rejected"}""");
        await pairing;
        Assert.Equal("Pairing was declined in the Dashboard.", desktop.Model.PairingMessage);
        Assert.False(desktop.Model.HasCredential);
        Assert.Null(desktop.Credentials.Value);
    }

    [Fact]
    public async Task CredentialReplacementIsStoredAndCleared()
    {
        using var desktop = new UiFixture();
        await desktop.Host.StartAsync();
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 1);
        desktop.Transports.Snapshot()[0].Enqueue(
            "{\"type\":\"auth_result\",\"version\":1,\"status\":\"error\",\"error\":\"credential_rotated\"}");
        await TestWait.Until(() => desktop.Host.Agent.Relay.Phase == ConnectionPhase.Error);
        desktop.Model.ProjectLiveState();
        Assert.True(desktop.Model.ShowCredentialReplacement);

        await desktop.Model.ReplaceCredentialAsync(Replacement);

        Assert.Null(desktop.Model.HeldReplacement);
        SecretAssert.Equal(Replacement, desktop.Credentials.Value);
        Assert.Equal(UiFixture.DeviceId, desktop.Settings.Load().Settings.DeviceId);
        Assert.True(desktop.Settings.Load().Settings.WantsConnection);
        Assert.False(File.ReadAllText(desktop.SettingsFile).Contains(Replacement, StringComparison.Ordinal));
        Assert.False(string.Join('\n', desktop.Model.VisibleText()).Contains(Replacement, StringComparison.Ordinal));
        await TestWait.Until(() => desktop.Transports.Snapshot().Length == 2);
    }

    [Fact]
    public async Task EmptyCredentialReplacementIsRejected()
    {
        using var desktop = new UiFixture();
        desktop.Model.LoadEditor();

        await desktop.Model.ReplaceCredentialAsync("   ");

        Assert.Null(desktop.Model.HeldReplacement);
        Assert.Equal(0, desktop.Credentials.Saves);
        SecretAssert.Equal("stored-credential", desktop.Credentials.Value);
        Assert.Equal("The credential is empty or too large to store.", desktop.Model.Notice);
    }
}
