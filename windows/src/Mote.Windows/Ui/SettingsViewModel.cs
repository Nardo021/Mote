using System.ComponentModel;
using System.Runtime.CompilerServices;
using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Ui;

public sealed class SettingsViewModel : INotifyPropertyChanged
{
    private readonly AgentCoordinator _agent;
    private readonly SettingsStore _settings;
    private readonly IStartupService _startup;
    private bool _busy;
    private bool _wantsConnection;
    private bool _hasCredential;
    private bool _launchAtLogin;
    private bool _settingsRecovered;
    private bool _showCredentialReplacement;
    private bool _showDisabledHelp;
    private bool _showCompatibilityHelp;
    private bool _showPair;
    private bool _pairingActive;
    private bool _nameEditable = true;
    private string _headline = "";
    private string _detail = "";
    private string _pairingMessage = "";
    private string _notice = "";
    private string _relayUrl = "";
    private string _deviceName = "";
    private string _deviceId = "";
    private string _pairedLabel = "Not paired";
    private string _connectionButton = "Connect";
    private string _heartbeat = "—";
    private string _settingsWarning = "";
    private string _launchNote = "";

    public SettingsViewModel(
        AgentCoordinator agent,
        SettingsStore settings,
        IStartupService startup,
        bool launchAtLoginAvailable,
        string version)
    {
        _agent = agent;
        _settings = settings;
        _startup = startup;
        LaunchAtLoginAvailable = launchAtLoginAvailable;
        Version = version;
        LaunchNote = launchAtLoginAvailable
            ? ""
            : "Launch at login is unavailable while Mote is running under the dotnet host.";
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public bool LaunchAtLoginAvailable { get; }

    public string Version { get; }

    public bool IsBusy
    {
        get => _busy;
        private set => Set(ref _busy, value);
    }

    public bool WantsConnection
    {
        get => _wantsConnection;
        private set => Set(ref _wantsConnection, value);
    }

    public bool HasCredential
    {
        get => _hasCredential;
        private set => Set(ref _hasCredential, value);
    }

    public bool LaunchAtLogin
    {
        get => _launchAtLogin;
        private set => Set(ref _launchAtLogin, value);
    }

    public bool SettingsRecovered
    {
        get => _settingsRecovered;
        private set => Set(ref _settingsRecovered, value);
    }

    public bool ShowCredentialReplacement
    {
        get => _showCredentialReplacement;
        private set => Set(ref _showCredentialReplacement, value);
    }

    public bool ShowDisabledHelp
    {
        get => _showDisabledHelp;
        private set => Set(ref _showDisabledHelp, value);
    }

    public bool ShowCompatibilityHelp
    {
        get => _showCompatibilityHelp;
        private set => Set(ref _showCompatibilityHelp, value);
    }

    public bool ShowPair
    {
        get => _showPair;
        private set => Set(ref _showPair, value);
    }

    public bool PairingActive
    {
        get => _pairingActive;
        private set => Set(ref _pairingActive, value);
    }

    public bool NameEditable
    {
        get => _nameEditable;
        private set => Set(ref _nameEditable, value);
    }

    public string Headline
    {
        get => _headline;
        private set => Set(ref _headline, value);
    }

    public string Detail
    {
        get => _detail;
        private set => Set(ref _detail, value);
    }

    public string PairingMessage
    {
        get => _pairingMessage;
        private set => Set(ref _pairingMessage, value);
    }

    public string Notice
    {
        get => _notice;
        private set => Set(ref _notice, value);
    }

    public string RelayUrlText
    {
        get => _relayUrl;
        set => Set(ref _relayUrl, value);
    }

    public string DeviceNameText
    {
        get => _deviceName;
        set => Set(ref _deviceName, value);
    }

    public string DeviceId
    {
        get => _deviceId;
        private set => Set(ref _deviceId, value);
    }

    public string PairedLabel
    {
        get => _pairedLabel;
        private set => Set(ref _pairedLabel, value);
    }

    public string ConnectionButton
    {
        get => _connectionButton;
        private set => Set(ref _connectionButton, value);
    }

    public string HeartbeatText
    {
        get => _heartbeat;
        private set => Set(ref _heartbeat, value);
    }

    public string SettingsWarning
    {
        get => _settingsWarning;
        private set => Set(ref _settingsWarning, value);
    }

    public string LaunchNote
    {
        get => _launchNote;
        private set => Set(ref _launchNote, value);
    }

    internal string? HeldReplacement { get; private set; }

    public void LoadEditor()
    {
        var loaded = _settings.Load();
        SettingsRecovered = loaded.RecoveredFromCorruption;
        SettingsWarning = loaded.RecoveredFromCorruption
            ? "Settings were reset because the settings file could not be read. The device credential was left in place."
            : "";
        var settings = loaded.Settings;
        RelayUrlText = settings.RelayUrl ?? "";
        DeviceNameText = settings.DeviceName;
        DeviceId = settings.DeviceId;
        if (LaunchAtLoginAvailable)
        {
            var actual = _startup.IsEnabled();
            LaunchAtLogin = actual;
            if (settings.LaunchAtLogin != actual)
            {
                _settings.Save(settings with { LaunchAtLogin = actual });
            }
        }
        else
        {
            LaunchAtLogin = false;
        }

        RefreshCredential();
        ProjectLiveState();
    }

    public void ProjectLiveState()
    {
        var phase = _agent.Relay.Phase;
        var error = _agent.Relay.LastError;
        var settings = _settings.Load().Settings;
        WantsConnection = settings.WantsConnection;
        var pairingPhase = _agent.Pairing.Phase;
        Headline = StatusCopy.Headline(phase, error);
        Detail = StatusCopy.Detail(phase, error);
        ShowCredentialReplacement = StatusCopy.OffersCredentialReplacement(phase, error);
        ShowDisabledHelp = phase == ConnectionPhase.Disabled || error == RelayCloseReason.DeviceDisabled;
        ShowCompatibilityHelp = error == RelayCloseReason.UnsupportedVersion;
        PairingActive = PairingCopy.IsActive(pairingPhase);
        PairingMessage = PairingCopy.For(pairingPhase, _agent.Pairing.Error);
        ShowPair = !HasCredential && !PairingActive;
        NameEditable = !HasCredential && !PairingActive;
        PairedLabel = HasCredential ? "Paired" : "Not paired";
        ConnectionButton = StatusCopy.OffersDisconnect(settings.WantsConnection, phase, HasCredential)
            ? "Disconnect"
            : "Connect";
        var roundTrip = _agent.Relay.HeartbeatRoundTripMilliseconds;
        HeartbeatText = roundTrip is null ? "—" : roundTrip + " ms";
        DeviceId = settings.DeviceId;
    }

    public void RefreshCredential()
    {
        try
        {
            HasCredential = !string.IsNullOrEmpty(_agent.Credentials.Read());
        }
        catch (CredentialStoreException)
        {
            HasCredential = false;
            Notice = "Credential Manager could not be read.";
        }
    }

    public async Task<ConnectResult> ConnectOrDisconnectAsync()
    {
        if (IsBusy)
        {
            return ConnectResult.Started;
        }

        IsBusy = true;
        try
        {
            var settings = _settings.Load().Settings;
            if (StatusCopy.OffersDisconnect(settings.WantsConnection, _agent.Relay.Phase, HasCredential))
            {
                await _agent.DisconnectAsync().ConfigureAwait(true);
                Notice = "Disconnected. This device stays paired.";
                ProjectLiveState();
                return ConnectResult.Started;
            }

            var saved = await _agent.SaveRelayUrlAsync(RelayUrlText).ConfigureAwait(true);
            if (saved == RelayUrlSaveResult.Invalid)
            {
                Notice = "Enter a valid http or https Relay URL.";
                return ConnectResult.InvalidRelayUrl;
            }

            var result = await _agent.ConnectAsync().ConfigureAwait(true);
            Notice = result switch
            {
                ConnectResult.Started => "",
                ConnectResult.PairingRequired => "Pair this device before connecting.",
                ConnectResult.InvalidRelayUrl => "Enter a valid http or https Relay URL.",
                ConnectResult.CredentialUnreadable => "Credential Manager could not be read.",
                _ => throw new InvalidOperationException($"Unhandled connect result {result}."),
            };
            ProjectLiveState();
            return result;
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task SaveRelayUrlAsync()
    {
        if (IsBusy)
        {
            return;
        }

        IsBusy = true;
        try
        {
            var result = await _agent.SaveRelayUrlAsync(RelayUrlText).ConfigureAwait(true);
            Notice = result switch
            {
                RelayUrlSaveResult.Saved => "Relay URL saved.",
                RelayUrlSaveResult.Unchanged => "Relay URL saved.",
                RelayUrlSaveResult.Invalid => "Enter a valid http or https Relay URL.",
                _ => throw new InvalidOperationException($"Unhandled relay URL result {result}."),
            };
            if (result != RelayUrlSaveResult.Invalid)
            {
                RelayUrlText = _settings.Load().Settings.RelayUrl ?? "";
            }

            ProjectLiveState();
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task PairAsync()
    {
        if (IsBusy || HasCredential || PairingActive)
        {
            return;
        }

        IsBusy = true;
        try
        {
            if (!_agent.TrySaveDeviceName(DeviceNameText, out var nameError))
            {
                Notice = nameError ?? "Enter a device name.";
                return;
            }

            DeviceNameText = _settings.Load().Settings.DeviceName;
            var saved = await _agent.SaveRelayUrlAsync(RelayUrlText).ConfigureAwait(true);
            if (saved == RelayUrlSaveResult.Invalid)
            {
                Notice = "Save a valid Relay URL before pairing.";
                return;
            }

            Notice = "";
            ProjectLiveState();
            var result = await _agent.PairAsync().ConfigureAwait(true);
            RefreshCredential();
            DeviceNameText = _settings.Load().Settings.DeviceName;
            DeviceId = _settings.Load().Settings.DeviceId;
            Notice = result switch
            {
                PairingResult.Approved => "Paired.",
                PairingResult.Rejected => "Pairing was declined in the Dashboard.",
                PairingResult.Expired => "The pairing request expired.",
                PairingResult.Cancelled => "Pairing cancelled.",
                PairingResult.Failed => PairingCopy.For(PairingPhase.Failed, _agent.Pairing.Error),
                _ => throw new InvalidOperationException($"Unhandled pairing result {result}."),
            };
            ProjectLiveState();
        }
        finally
        {
            IsBusy = false;
        }
    }

    public async Task CancelPairingAsync()
    {
        await _agent.Pairing.CancelAsync().ConfigureAwait(true);
        RefreshCredential();
        ProjectLiveState();
        Notice = "Pairing cancelled.";
    }

    public async Task ReplaceCredentialAsync(string replacement)
    {
        if (IsBusy)
        {
            return;
        }

        IsBusy = true;
        HeldReplacement = replacement;
        try
        {
            var result = await _agent.ReplaceCredentialAndReconnectAsync(replacement).ConfigureAwait(true);
            Notice = result switch
            {
                CredentialReplaceResult.Saved => "Credential saved. Connecting…",
                CredentialReplaceResult.Invalid => "The credential is empty or too large to store.",
                CredentialReplaceResult.StoreFailed => "Credential Manager could not store the credential.",
                _ => throw new InvalidOperationException($"Unhandled credential result {result}."),
            };
            if (result == CredentialReplaceResult.Saved)
            {
                RefreshCredential();
            }

            ProjectLiveState();
        }
        finally
        {
            HeldReplacement = null;
            IsBusy = false;
        }
    }

    public async Task SetLaunchAtLoginAsync(bool enabled)
    {
        if (!LaunchAtLoginAvailable)
        {
            LaunchAtLogin = false;
            Notice = LaunchNote;
            return;
        }

        if (IsBusy)
        {
            return;
        }

        IsBusy = true;
        try
        {
            var update = StartupRegistration.Apply(_startup, enabled);
            LaunchAtLogin = update.Enabled;
            var settings = _settings.Load().Settings;
            _settings.Save(settings with { LaunchAtLogin = update.Enabled });
            Notice = update.Error ?? "";
        }
        finally
        {
            IsBusy = false;
        }
    }

    public void SetNotice(string notice) => Notice = notice;

    public IReadOnlyList<string> VisibleText() =>
    [
        Headline,
        Detail,
        PairingMessage,
        Notice,
        RelayUrlText,
        DeviceNameText,
        DeviceId,
        PairedLabel,
        ConnectionButton,
        HeartbeatText,
        SettingsWarning,
        LaunchNote,
        Version,
    ];

    private void Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return;
        }

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
