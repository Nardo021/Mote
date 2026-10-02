using System.Text;
using Mote.Windows.Platform;
using Mote.Windows.Protocol;
using Mote.Windows.Storage;

namespace Mote.Windows.Networking;

/// <summary>
/// The Windows connection and session state machine. Network and power events
/// enter here; this type remains the only reconnect and generation authority.
/// </summary>
public sealed class RelayClient
{
    private readonly Func<IMessageTransport> _transports;
    private readonly Func<AppSettings> _settings;
    private readonly Func<string?> _credential;
    private readonly Func<CommandFrame, CommandResultFrame> _process;
    private readonly ReconnectPolicy _policy;
    private readonly IAsyncDelay _delay;
    private readonly Func<long> _now;
    private readonly string _appVersion;
    private readonly Action<string>? _log;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private long _generation;
    private bool _authenticated;
    private bool _intentionalDisconnect;
    private bool _terminal;
    private bool _connectInFlight;
    private bool _networkAvailable = true;
    private bool _suspended;
    private int _reconnectAttempt;
    private ConnectionPhase _phase = ConnectionPhase.Disconnected;
    private string? _lastError;
    private long? _roundTripMilliseconds;
    private IMessageTransport? _transport;
    private CancellationTokenSource? _lifetime;
    private CancellationTokenSource? _session;
    private CancellationTokenSource? _authTimeout;
    private CancellationTokenSource? _reconnectDelay;

    public RelayClient(
        Func<IMessageTransport> transportFactory,
        Func<AppSettings> settings,
        Func<string?> credential,
        Func<CommandFrame, CommandResultFrame> process,
        ReconnectPolicy? reconnect = null,
        IAsyncDelay? delay = null,
        Func<long>? now = null,
        string? appVersion = null,
        Action<string>? log = null)
    {
        _transports = transportFactory;
        _settings = settings;
        _credential = credential;
        _process = process;
        _policy = reconnect ?? new ReconnectPolicy();
        _delay = delay ?? new TaskAsyncDelay();
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _appVersion = appVersion ?? AppVersion.Current;
        _log = log;
    }

    public ConnectionPhase Phase
    {
        get
        {
            _gate.Wait();
            try
            {
                return _phase;
            }
            finally
            {
                _gate.Release();
            }
        }
    }

    public bool IsAuthenticated
    {
        get
        {
            _gate.Wait();
            try
            {
                return _authenticated;
            }
            finally
            {
                _gate.Release();
            }
        }
    }

    public string? LastError
    {
        get
        {
            _gate.Wait();
            try
            {
                return _lastError;
            }
            finally
            {
                _gate.Release();
            }
        }
    }

    public long? HeartbeatRoundTripMilliseconds
    {
        get
        {
            _gate.Wait();
            try
            {
                return _roundTripMilliseconds;
            }
            finally
            {
                _gate.Release();
            }
        }
    }

    internal long Generation
    {
        get
        {
            _gate.Wait();
            try
            {
                return _generation;
            }
            finally
            {
                _gate.Release();
            }
        }
    }

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_lifetime is null || _lifetime.IsCancellationRequested)
            {
                _lifetime?.Dispose();
                _lifetime = new CancellationTokenSource();
            }

            _intentionalDisconnect = false;
            _terminal = false;
        }
        finally
        {
            _gate.Release();
        }

        await ConnectAsync(isReconnect: false, resetBackoff: true).ConfigureAwait(false);
    }

    public async Task StopAsync(bool intentional, CancellationToken cancellationToken = default)
    {
        IMessageTransport? transport;
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (intentional)
            {
                _intentionalDisconnect = true;
                _lifetime?.Cancel();
                _lastError = null;
                _phase = ConnectionPhase.Disconnected;
                Log("Intentional disconnect");
            }

            _reconnectDelay?.Cancel();
            _connectInFlight = false;
            _generation++;
            _authenticated = false;
            _session?.Cancel();
            _authTimeout?.Cancel();
            transport = _transport;
            _transport = null;
        }
        finally
        {
            _gate.Release();
        }

        await CloseQuietlyAsync(transport).ConfigureAwait(false);
    }

    internal Task NoteNetworkAsync(NetworkAvailability availability) =>
        availability == NetworkAvailability.Available
            ? RestoreNetworkAsync()
            : LoseNetworkAsync();

    internal Task NotePathChangedAsync() => RefreshPathAsync();

    internal Task NotePowerAsync(PowerTransition transition)
    {
        switch (transition)
        {
            case PowerTransition.Suspend:
                return SuspendAsync();
            case PowerTransition.Resume:
                return ResumeAsync();
            default:
                throw new InvalidOperationException($"Unhandled power transition {transition}.");
        }
    }

    internal Task HandleIncomingAsync(long generation, string json) =>
        HandleIncomingCoreAsync(generation, json);

    internal Task SendHeartbeatForTestAsync(long generation) =>
        SendHeartbeatAsync(generation, CancellationToken.None);

    private async Task ConnectAsync(bool isReconnect, bool resetBackoff)
    {
        long generation;
        IMessageTransport transport;
        Uri uri;
        string credential;
        CancellationToken sessionToken;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (resetBackoff)
            {
                _reconnectAttempt = 0;
            }

            if (!CanAttempt())
            {
                PresentLifecyclePhase();
                return;
            }

            _connectInFlight = true;
            var attempt = _generation;
            string? secret;
            try
            {
                secret = _credential();
            }
            catch (Exception)
            {
                if (_generation == attempt)
                {
                    _connectInFlight = false;
                    _lastError = "Failed to read device credential";
                    _phase = ConnectionPhase.Error;
                    Log("Failed to read device credential");
                }

                return;
            }

            if (_generation != attempt || !CanContinue())
            {
                _connectInFlight = false;
                return;
            }

            var settings = _settings();
            if (string.IsNullOrEmpty(secret)
                || !RelayAddress.TryParseBase(settings.RelayUrl ?? "", out var baseUri)
                || baseUri is null)
            {
                _connectInFlight = false;
                _phase = ConnectionPhase.NotConfigured;
                Log("Relay URL or device credential is not configured");
                return;
            }

            _generation++;
            generation = _generation;
            ReplaceSession();
            _authenticated = false;
            _roundTripMilliseconds = null;
            _phase = isReconnect ? ConnectionPhase.Reconnecting : ConnectionPhase.Connecting;
            uri = RelayAddress.DeviceWebSocket(baseUri);
            if (uri.Query.Length > 0 || uri.AbsoluteUri.Contains(secret, StringComparison.Ordinal))
            {
                _connectInFlight = false;
                _phase = ConnectionPhase.Error;
                _lastError = "The device socket URL is invalid.";
                Log("The device socket URL is invalid.");
                return;
            }

            transport = _transports();
            _transport = transport;
            credential = secret;
            sessionToken = _session!.Token;
            Log("Connection attempt");
        }
        finally
        {
            _gate.Release();
        }

        try
        {
            await transport.ConnectAsync(uri, sessionToken).ConfigureAwait(false);
            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (generation != _generation || !CanContinue())
                {
                    if (generation == _generation)
                    {
                        _connectInFlight = false;
                    }

                    return;
                }

                _phase = ConnectionPhase.Authenticating;
            }
            finally
            {
                _gate.Release();
            }

            var auth = AuthFrame.ForWindows(_settings().DeviceId, credential, _appVersion);
            var payload = Encoding.UTF8.GetBytes(ProtocolCodec.Encode(auth));
            try
            {
                await transport.SendAsync(payload, sessionToken).ConfigureAwait(false);
            }
            finally
            {
                Array.Clear(payload);
            }

            await _gate.WaitAsync().ConfigureAwait(false);
            try
            {
                if (generation != _generation || !CanContinue())
                {
                    if (generation == _generation)
                    {
                        _connectInFlight = false;
                    }

                    return;
                }

                var receiveToken = _session!.Token;
                _ = ReceiveLoopAsync(generation, transport, receiveToken);
                StartAuthTimeout(generation);
            }
            finally
            {
                _gate.Release();
            }
        }
        catch (OperationCanceledException)
        {
            // This generation was replaced or the caller disconnected.
        }
        catch (Exception)
        {
            Log("Connection attempt failed");
            await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
        }
    }

    private async Task ReceiveLoopAsync(long generation, IMessageTransport transport, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            byte[] bytes;
            try
            {
                bytes = await transport.ReceiveAsync(token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (TransportException exception) when (exception.Failure == TransportFailure.Closed)
            {
                if (token.IsCancellationRequested || generation != Generation || _intentionalDisconnect)
                {
                    return;
                }

                if (await TrySettleTerminalCloseAsync(generation, exception.CloseReason).ConfigureAwait(false))
                {
                    return;
                }

                Log("Connection lost");
                await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
                return;
            }
            catch (Exception)
            {
                if (token.IsCancellationRequested || generation != Generation || _intentionalDisconnect)
                {
                    return;
                }

                Log("Connection lost");
                await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
                return;
            }

            try
            {
                await HandleIncomingCoreAsync(generation, Encoding.UTF8.GetString(bytes)).ConfigureAwait(false);
            }
            catch (Exception)
            {
                Log("Ignored malformed device frame");
            }
        }
    }

    private async Task HandleIncomingCoreAsync(long generation, string json)
    {
        var read = DeviceFrameReader.Parse(json);
        switch (read.Kind)
        {
            case DeviceReadKind.Malformed:
                Log("Ignored malformed device frame");
                return;
            case DeviceReadKind.Pairing:
                Log("Ignored pairing frame on the device channel");
                return;
            case DeviceReadKind.Unknown:
                Log("Ignored unknown device frame");
                return;
            case DeviceReadKind.Command:
                await HandleCommandAsync(generation, read.Command!).ConfigureAwait(false);
                return;
            case DeviceReadKind.Frame:
                await HandleFrameAsync(generation, read.Frame!).ConfigureAwait(false);
                return;
            default:
                throw new InvalidOperationException($"Unhandled device frame {read.Kind}.");
        }
    }

    private async Task HandleFrameAsync(long generation, ProtocolFrame frame)
    {
        switch (frame)
        {
            case AuthResultFrame authResult:
                await HandleAuthResultAsync(generation, authResult).ConfigureAwait(false);
                return;
            case HeartbeatAckFrame ack:
                NoteHeartbeatAck(generation, ack);
                return;
            case ErrorFrame:
                Log("Relay error frame");
                return;
            case HeartbeatFrame:
            case CommandResultFrame:
            case AuthFrame:
                return;
            default:
                Log("Ignored unknown device frame");
                return;
        }
    }

    private async Task HandleAuthResultAsync(long generation, AuthResultFrame result)
    {
        if (!result.IsSuccessful)
        {
            await SettleAuthFailureAsync(generation, result.Error).ConfigureAwait(false);
            return;
        }

        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (generation != _generation || _authenticated)
            {
                return;
            }

            _authTimeout?.Cancel();
            _connectInFlight = false;
            _authenticated = true;
            _lastError = null;
            _phase = ConnectionPhase.Connected;
            Log("Authenticated");
            StartHeartbeat(generation);
            StartStableReset(generation);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task SettleAuthFailureAsync(long generation, string? error)
    {
        var reason = error switch
        {
            RelayCloseReason.InvalidCredentials => RelayCloseReason.InvalidCredentials,
            RelayCloseReason.UnsupportedVersion => RelayCloseReason.UnsupportedVersion,
            RelayCloseReason.DeviceDisabled => RelayCloseReason.DeviceDisabled,
            RelayCloseReason.CredentialRotated => RelayCloseReason.CredentialRotated,
            null or "" => RelayCloseReason.InvalidCredentials,
            _ => "auth_failed",
        };
        await SettleTerminalAsync(generation, reason).ConfigureAwait(false);
    }

    private async Task<bool> TrySettleTerminalCloseAsync(long generation, string? reason)
    {
        if (reason is null || !RelayCloseReason.StopsReconnect(reason))
        {
            return false;
        }

        await SettleTerminalAsync(generation, reason).ConfigureAwait(false);
        return true;
    }

    private async Task SettleTerminalAsync(long generation, string reason)
    {
        IMessageTransport? transport;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (generation != _generation)
            {
                return;
            }

            _intentionalDisconnect = true;
            _terminal = true;
            _connectInFlight = false;
            _authenticated = false;
            _lastError = reason;
            _phase = reason == RelayCloseReason.DeviceDisabled
                ? ConnectionPhase.Disabled
                : ConnectionPhase.Error;
            _generation++;
            _session?.Cancel();
            _authTimeout?.Cancel();
            transport = _transport;
            _transport = null;
            Log($"Terminal authentication state {reason}");
        }
        finally
        {
            _gate.Release();
        }

        await CloseQuietlyAsync(transport).ConfigureAwait(false);
    }

    private async Task HandleUnexpectedDisconnectAsync(long generation)
    {
        IMessageTransport? transport;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (generation != _generation || _intentionalDisconnect || _terminal)
            {
                return;
            }

            _connectInFlight = false;
            _generation++;
            _authenticated = false;
            _session?.Cancel();
            _authTimeout?.Cancel();
            transport = _transport;
            _transport = null;
            _phase = ConnectionPhase.Reconnecting;
            Log("Disconnect transient");
        }
        finally
        {
            _gate.Release();
        }

        await CloseQuietlyAsync(transport).ConfigureAwait(false);
        await ScheduleReconnectAsync().ConfigureAwait(false);
    }

    private async Task ScheduleReconnectAsync()
    {
        TimeSpan delay;
        CancellationToken token;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (!CanAttempt() || _lifetime is null)
            {
                return;
            }

            var attempt = _reconnectAttempt;
            _reconnectAttempt++;
            delay = _policy.Delay(attempt);
            _phase = ConnectionPhase.Reconnecting;
            _reconnectDelay?.Cancel();
            _reconnectDelay?.Dispose();
            _reconnectDelay = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
            token = _reconnectDelay.Token;
            Log("Reconnect scheduled");
        }
        finally
        {
            _gate.Release();
        }

        try
        {
            await _delay.DelayAsync(delay, token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        await ConnectAsync(isReconnect: true, resetBackoff: false).ConfigureAwait(false);
    }

    private async Task HandleCommandAsync(long generation, CommandFrame command)
    {
        CommandResultFrame result;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (generation != _generation)
            {
                return;
            }

            if (!_authenticated)
            {
                Log("Ignored command before authentication");
                return;
            }

            Log($"Command {command.Id}");
            try
            {
                result = _process(command);
            }
            catch (Exception)
            {
                result = CommandResultFrame.Create(
                    command.Id,
                    CommandResultStatuses.Failed,
                    _now(),
                    "execution_failed");
            }

            if (generation != _generation)
            {
                return;
            }
        }
        finally
        {
            _gate.Release();
        }

        if (!await SendFrameAsync(generation, ProtocolCodec.Encode(result), $"Command result {result.CommandId} {result.Status}")
                .ConfigureAwait(false))
        {
            await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
        }
    }

    private void NoteHeartbeatAck(long generation, HeartbeatAckFrame ack)
    {
        _gate.Wait();
        try
        {
            if (generation != _generation || !_authenticated)
            {
                return;
            }

            var roundTrip = _now() - ack.SentAt;
            if (roundTrip >= 0 && roundTrip < 60_000)
            {
                _roundTripMilliseconds = roundTrip;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private void StartHeartbeat(long generation)
    {
        var token = _session!.Token;
        _ = HeartbeatLoopAsync(generation, token);
    }

    private async Task HeartbeatLoopAsync(long generation, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                await _delay.DelayAsync(ClientPolicy.HeartbeatInterval, token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            if (token.IsCancellationRequested)
            {
                return;
            }

            try
            {
                if (!await SendHeartbeatAsync(generation, token).ConfigureAwait(false))
                {
                    await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
                    return;
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception)
            {
                await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
                return;
            }
        }
    }

    private async Task<bool> SendHeartbeatAsync(long generation, CancellationToken token)
    {
        var settings = _settings();
        var frame = new HeartbeatFrame
        {
            Type = "heartbeat",
            Version = ProtocolConstants.Version,
            DeviceId = settings.DeviceId,
            SentAt = _now(),
        };
        return await SendFrameAsync(generation, ProtocolCodec.Encode(frame), log: null, token, requireAuthenticated: true)
            .ConfigureAwait(false);
    }

    private void StartAuthTimeout(long generation)
    {
        _authTimeout?.Cancel();
        _authTimeout?.Dispose();
        _authTimeout = CancellationTokenSource.CreateLinkedTokenSource(_session!.Token);
        var token = _authTimeout.Token;
        _ = AuthTimeoutAsync(generation, token);
    }

    private async Task AuthTimeoutAsync(long generation, CancellationToken token)
    {
        try
        {
            await _delay.DelayAsync(ClientPolicy.AuthTimeout, token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (generation != _generation || _authenticated || !CanContinue())
            {
                return;
            }

            _connectInFlight = false;
            _lastError = "Authentication timed out";
            _phase = ConnectionPhase.Error;
            Log("Authentication timed out");
        }
        finally
        {
            _gate.Release();
        }

        await HandleUnexpectedDisconnectAsync(generation).ConfigureAwait(false);
    }

    private void StartStableReset(long generation)
    {
        var token = _session!.Token;
        _ = StableResetAsync(generation, token);
    }

    private async Task StableResetAsync(long generation, CancellationToken token)
    {
        try
        {
            await _delay.DelayAsync(ClientPolicy.StableConnectionReset, token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (generation == _generation && _authenticated)
            {
                _reconnectAttempt = 0;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<bool> SendFrameAsync(
        long generation,
        string json,
        string? log,
        CancellationToken token = default,
        bool requireAuthenticated = false)
    {
        IMessageTransport? transport;
        byte[] payload;
        await _gate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            if (generation != _generation || _transport is null)
            {
                return true;
            }

            if (requireAuthenticated && !_authenticated)
            {
                return true;
            }

            transport = _transport;
            payload = Encoding.UTF8.GetBytes(json);
            if (log is not null)
            {
                Log(log);
            }
        }
        finally
        {
            _gate.Release();
        }

        try
        {
            await transport.SendAsync(payload, token).ConfigureAwait(false);
            return true;
        }
        catch (Exception)
        {
            if (log is not null)
            {
                Log("Failed to send command result");
            }

            return false;
        }
        finally
        {
            Array.Clear(payload);
        }
    }

    private void ReplaceSession()
    {
        _session?.Cancel();
        _session?.Dispose();
        _authTimeout?.Cancel();
        _authTimeout?.Dispose();
        _authTimeout = null;
        _session = CancellationTokenSource.CreateLinkedTokenSource(_lifetime!.Token);
    }

    private bool LifetimeActive => _lifetime is { IsCancellationRequested: false };

    private bool CanAttempt() => CanContinue() && !_authenticated && !_connectInFlight && WantsConnection();

    private bool CanContinue() =>
        LifetimeActive && !_intentionalDisconnect && !_terminal && !_suspended && _networkAvailable;

    private bool WantsConnection() => _settings().WantsConnection;

    private bool HasRelayTarget()
    {
        var settings = _settings();
        return settings.WantsConnection
            && RelayAddress.TryParseBase(settings.RelayUrl ?? "", out var baseUri)
            && baseUri is not null;
    }

    private async Task LoseNetworkAsync()
    {
        IMessageTransport? transport;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (!_networkAvailable)
            {
                return;
            }

            _networkAvailable = false;
            _reconnectDelay?.Cancel();
            Log("Network unavailable");
            transport = InvalidateLiveTransport();
        }
        finally
        {
            _gate.Release();
        }

        await CloseQuietlyAsync(transport).ConfigureAwait(false);
    }

    private async Task RestoreNetworkAsync()
    {
        var recover = false;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_networkAvailable)
            {
                return;
            }

            _networkAvailable = true;
            _reconnectDelay?.Cancel();
            Log("Network restored");
            recover = CanAttempt();
            if (recover)
            {
                Log("Immediate reconnect");
            }
            else
            {
                PresentLifecyclePhase();
            }
        }
        finally
        {
            _gate.Release();
        }

        if (recover)
        {
            await ConnectAsync(isReconnect: true, resetBackoff: true).ConfigureAwait(false);
        }
    }

    private async Task RefreshPathAsync()
    {
        IMessageTransport? transport = null;
        var recover = false;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_suspended || !_networkAvailable || !LifetimeActive || _intentionalDisconnect || _terminal)
            {
                return;
            }

            _reconnectDelay?.Cancel();
            transport = InvalidateLiveTransport();
            recover = CanAttempt();
            if (recover)
            {
                Log("Immediate reconnect");
            }
        }
        finally
        {
            _gate.Release();
        }

        var closing = CloseQuietlyAsync(transport);
        if (recover)
        {
            await ConnectAsync(isReconnect: true, resetBackoff: true).ConfigureAwait(false);
        }

        await closing.ConfigureAwait(false);
    }

    private async Task SuspendAsync()
    {
        IMessageTransport? transport;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_suspended)
            {
                return;
            }

            _suspended = true;
            _reconnectDelay?.Cancel();
            Log("System suspend");
            transport = InvalidateLiveTransport();
        }
        finally
        {
            _gate.Release();
        }

        await CloseQuietlyAsync(transport).ConfigureAwait(false);
    }

    private async Task ResumeAsync()
    {
        var recover = false;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (!_suspended)
            {
                return;
            }

            _suspended = false;
            Log("System resume");
            recover = CanAttempt();
            if (recover)
            {
                Log("Immediate reconnect");
            }
            else
            {
                PresentLifecyclePhase();
            }
        }
        finally
        {
            _gate.Release();
        }

        if (recover)
        {
            await ConnectAsync(isReconnect: true, resetBackoff: true).ConfigureAwait(false);
        }
    }

    private IMessageTransport? InvalidateLiveTransport()
    {
        var live = _authenticated || _transport is not null || _connectInFlight;
        if (!live)
        {
            PresentLifecyclePhase();
            return null;
        }

        _connectInFlight = false;
        _generation++;
        _authenticated = false;
        _roundTripMilliseconds = null;
        _session?.Cancel();
        _authTimeout?.Cancel();
        var transport = _transport;
        _transport = null;
        PresentLifecyclePhase();
        Log("Transport invalidated");
        return transport;
    }

    private void PresentLifecyclePhase()
    {
        if (_terminal || _intentionalDisconnect || !LifetimeActive || _authenticated || _connectInFlight || !HasRelayTarget())
        {
            return;
        }

        if (!_networkAvailable)
        {
            _lastError = null;
            _phase = ConnectionPhase.NetworkUnavailable;
            return;
        }

        if (_suspended)
        {
            _lastError = null;
            _phase = ConnectionPhase.Disconnected;
        }
    }

    private static async Task CloseQuietlyAsync(IMessageTransport? transport)
    {
        if (transport is null)
        {
            return;
        }

        try
        {
            using var abort = new CancellationTokenSource();
            abort.Cancel();
            await transport.CloseAsync("client_close", abort.Token).ConfigureAwait(false);
        }
        catch (Exception)
        {
            // The socket is already unusable.
        }
    }

    private void Log(string message)
    {
        AgentLog.Info(message);
        _log?.Invoke(message);
    }
}
