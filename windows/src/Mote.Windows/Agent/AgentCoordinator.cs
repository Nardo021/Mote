using System.Net.Http;
using Mote.Windows.Actions;
using Mote.Windows.Commands;
using Mote.Windows.Networking;
using Mote.Windows.Protocol;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Agent;

public sealed class AgentCoordinator
{
    private readonly SettingsStore _settings;
    private readonly IWorkstationLock _workstation;
    private readonly Func<long> _now;
    private readonly HttpClient? _http;
    private readonly RelayClient _relay;
    private readonly PairingClient _pairing;
    private CommandProcessor _processor;

    public AgentCoordinator(
        SettingsStore settings,
        ICredentialStore credentials,
        IWorkstationLock workstationLock,
        Func<IMessageTransport>? transportFactory = null,
        IPairingApi? pairingApi = null,
        IAsyncDelay? delay = null,
        ReconnectPolicy? reconnect = null,
        Func<long>? now = null,
        string? appVersion = null)
    {
        _settings = settings;
        Credentials = credentials;
        _workstation = workstationLock;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        var transports = transportFactory ?? (() => new WebSocketTransport());
        IPairingApi api;
        if (pairingApi is null)
        {
            _http = new HttpClient();
            api = new HttpPairingApi(_http);
        }
        else
        {
            _http = null;
            api = pairingApi;
        }

        _processor = CreateProcessor();
        _relay = new RelayClient(
            transports,
            () => _settings.Load().Settings,
            ReadCredential,
            Process,
            reconnect,
            delay,
            _now,
            appVersion);
        _pairing = new PairingClient(api, transports, settings, credentials);
    }

    public ICredentialStore Credentials { get; }

    public RelayClient Relay => _relay;

    public PairingClient Pairing => _pairing;

    public bool IsRunning { get; private set; }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (IsRunning)
        {
            return;
        }

        IsRunning = true;
        var settings = _settings.Load().Settings;
        if (!settings.WantsConnection)
        {
            return;
        }

        string? credential;
        try
        {
            credential = Credentials.Read();
        }
        catch (CredentialStoreException)
        {
            AgentLog.Info("Failed to read device credential");
            return;
        }

        if (string.IsNullOrWhiteSpace(settings.RelayUrl) || string.IsNullOrEmpty(credential))
        {
            return;
        }

        await _relay.StartAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task ShutdownAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await _pairing.CancelAsync().ConfigureAwait(false);
        await _relay.StopAsync(intentional: true, cancellationToken).ConfigureAwait(false);
        _http?.Dispose();
        IsRunning = false;
    }

    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        var settings = _settings.Load().Settings;
        _settings.Save(settings with { WantsConnection = false });
        await _relay.StopAsync(intentional: true, cancellationToken).ConfigureAwait(false);
    }

    public async Task<PairingResult> PairAsync(CancellationToken cancellationToken = default)
    {
        var result = await _pairing.PairAsync(cancellationToken).ConfigureAwait(false);
        if (result != PairingResult.Approved)
        {
            return result;
        }

        _processor = CreateProcessor();
        var settings = _settings.Load().Settings;
        if (settings.WantsConnection)
        {
            await _relay.StartAsync(cancellationToken).ConfigureAwait(false);
        }

        return result;
    }

    public CommandResultFrame Process(CommandFrame command) => _processor.Process(command);

    private CommandProcessor CreateProcessor()
    {
        var loaded = _settings.Load().Settings;
        return new CommandProcessor(loaded.DeviceId, new LockAction(_workstation), _now);
    }

    private string? ReadCredential() => Credentials.Read();
}
