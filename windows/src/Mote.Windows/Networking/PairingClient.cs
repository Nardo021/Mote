using System.Text;
using Mote.Windows.Protocol;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Networking;

public enum PairingPhase
{
    Idle,
    CreatingRequest,
    Connecting,
    Authenticating,
    PendingApproval,
    Approved,
    Rejected,
    Expired,
    Cancelled,
    Failed,
}

public enum PairingResult
{
    Approved,
    Rejected,
    Expired,
    Cancelled,
    Failed,
}

public sealed class PairingClient
{
    private readonly IPairingApi _api;
    private readonly Func<IMessageTransport> _transports;
    private readonly SettingsStore _settings;
    private readonly ICredentialStore _credentials;
    private readonly Action<string>? _log;
    private readonly object _state = new();

    private PairingPhase _phase = PairingPhase.Idle;
    private string? _error;
    private bool _running;
    private bool _cancelSent;
    private string? _requestId;
    private string? _secret;
    private Uri? _baseUri;
    private IMessageTransport? _transport;
    private CancellationTokenSource? _session;

    public PairingClient(
        IPairingApi api,
        Func<IMessageTransport> transportFactory,
        SettingsStore settings,
        ICredentialStore credentials,
        Action<string>? log = null)
    {
        _api = api;
        _transports = transportFactory;
        _settings = settings;
        _credentials = credentials;
        _log = log;
    }

    public PairingPhase Phase
    {
        get
        {
            lock (_state)
            {
                return _phase;
            }
        }
    }

    public string? Error
    {
        get
        {
            lock (_state)
            {
                return _error;
            }
        }
    }

    public async Task<PairingResult> PairAsync(CancellationToken cancellationToken = default)
    {
        lock (_state)
        {
            if (_running)
            {
                throw new InvalidOperationException("Pairing is already in progress.");
            }

            _running = true;
            _cancelSent = false;
            _requestId = null;
            _secret = null;
            _baseUri = null;
            _error = null;
            _phase = PairingPhase.CreatingRequest;
        }

        try
        {
            return await PairCoreAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            await CloseTransportAsync().ConfigureAwait(false);
            lock (_state)
            {
                try
                {
                    _session?.Dispose();
                }
                catch (ObjectDisposedException)
                {
                    // Cancel already disposed the session.
                }

                _session = null;
                _running = false;
            }
        }
    }

    public async Task CancelAsync()
    {
        string? requestId;
        string? secret;
        Uri? baseUri;
        lock (_state)
        {
            if (!IsInFlight(_phase))
            {
                return;
            }

            _phase = PairingPhase.Cancelled;
            requestId = _requestId;
            secret = _secret;
            baseUri = _baseUri;
            _requestId = null;
            _secret = null;
            try
            {
                _session?.Cancel();
            }
            catch (ObjectDisposedException)
            {
                // The pairing task already finished the session.
            }
        }

        Log("Pairing cancelled");
        await CloseTransportAsync().ConfigureAwait(false);
        if (requestId is not null && secret is not null && baseUri is not null)
        {
            await SendCancelAsync(baseUri, requestId, secret).ConfigureAwait(false);
        }
    }

    private async Task<PairingResult> PairCoreAsync(CancellationToken cancellationToken)
    {
        CancellationToken token;
        lock (_state)
        {
            _session = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            token = _session.Token;
        }

        try
        {
            var settings = _settings.Load().Settings;
            if (!RelayAddress.TryParseBase(settings.RelayUrl ?? "", out var baseUri) || baseUri is null)
            {
                return Fail("Relay URL is not configured.");
            }

            PairCreated created;
            try
            {
                created = await _api.CreateAsync(baseUri, settings.DeviceId, settings.DeviceName, token)
                    .ConfigureAwait(false);
            }
            catch (PairingException)
            {
                return Fail("The relay rejected the pairing request.");
            }

            if (created.RequestId.Length == 0 || created.PairSecret.Length == 0)
            {
                return Fail("The relay returned an invalid pairing response.");
            }

            var socketUri = RelayAddress.PairWebSocket(baseUri);
            if (socketUri.AbsoluteUri.Contains("pair_secret", StringComparison.OrdinalIgnoreCase)
                || socketUri.AbsoluteUri.Contains(created.PairSecret, StringComparison.Ordinal))
            {
                return Fail("The pairing socket URL is invalid.");
            }

            lock (_state)
            {
                if (_phase == PairingPhase.Cancelled)
                {
                    return PairingResult.Cancelled;
                }

                _requestId = created.RequestId;
                _secret = created.PairSecret;
                _baseUri = baseUri;
                _phase = PairingPhase.Connecting;
            }

            var transport = _transports();
            lock (_state)
            {
                _transport = transport;
            }

            await transport.ConnectAsync(socketUri, token).ConfigureAwait(false);
            lock (_state)
            {
                if (_phase == PairingPhase.Cancelled)
                {
                    return PairingResult.Cancelled;
                }

                _phase = PairingPhase.Authenticating;
            }

            var auth = new PairAuthFrame
            {
                Type = "pair_auth",
                Version = ProtocolConstants.Version,
                RequestId = created.RequestId,
                PairSecret = created.PairSecret,
            };
            var payload = Encoding.UTF8.GetBytes(ProtocolCodec.Encode(auth));
            try
            {
                await transport.SendAsync(payload, token).ConfigureAwait(false);
            }
            finally
            {
                Array.Clear(payload);
            }

            while (!token.IsCancellationRequested)
            {
                var bytes = await transport.ReceiveAsync(token).ConfigureAwait(false);
                var text = Encoding.UTF8.GetString(bytes);
                var step = Interpret(text);
                switch (step)
                {
                    case PairRead.Pending:
                        lock (_state)
                        {
                            if (_phase != PairingPhase.Cancelled)
                            {
                                _phase = PairingPhase.PendingApproval;
                            }
                        }

                        Log("Pairing pending");
                        continue;
                    case PairRead.Approved approved:
                        return await FinishApprovedAsync(approved.Frame).ConfigureAwait(false);
                    case PairRead.Rejected:
                        return Finish(PairingPhase.Rejected, PairingResult.Rejected, "Pairing rejected");
                    case PairRead.Expired:
                        return Finish(PairingPhase.Expired, PairingResult.Expired, "Pairing expired");
                    case PairRead.Failed:
                        return Fail("Pairing failed.");
                    case PairRead.Ignore:
                        continue;
                    default:
                        return Unexpected(step);
                }
            }

            return await CancelledAsync().ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return await CancelledAsync().ConfigureAwait(false);
        }
        catch (PairingException)
        {
            return Fail("Pairing failed.");
        }
        catch (Exception)
        {
            return Fail("Pairing failed.");
        }
    }

    private async Task<PairingResult> FinishApprovedAsync(PairApprovedFrame frame)
    {
        if (!Guid.TryParse(frame.DeviceId, out _)
            || string.IsNullOrWhiteSpace(frame.Name)
            || !IsStorableCredential(frame.Credential))
        {
            return Fail("The relay returned an invalid pairing approval.");
        }

        AppSettings previous;
        lock (_state)
        {
            if (_phase == PairingPhase.Cancelled)
            {
                return PairingResult.Cancelled;
            }

            previous = _settings.Load().Settings;
        }

        try
        {
            _credentials.Save(frame.Credential);
        }
        catch (Exception)
        {
            return Fail("The device credential could not be saved.");
        }

        lock (_state)
        {
            if (_phase == PairingPhase.Cancelled)
            {
                _requestId = null;
                _secret = null;
            }
        }

        if (Phase == PairingPhase.Cancelled)
        {
            TryDeleteCredential();
            return PairingResult.Cancelled;
        }

        try
        {
            _settings.Save(previous with
            {
                DeviceId = frame.DeviceId,
                DeviceName = frame.Name.Trim(),
            });
        }
        catch (Exception)
        {
            TryDeleteCredential();
            return Fail("Pairing could not be completed.");
        }

        lock (_state)
        {
            if (_phase == PairingPhase.Cancelled)
            {
                _requestId = null;
                _secret = null;
            }
            else
            {
                _phase = PairingPhase.Approved;
                _error = null;
                _requestId = null;
                _secret = null;
            }
        }

        if (Phase == PairingPhase.Cancelled)
        {
            TryDeleteCredential();
            try
            {
                _settings.Save(previous);
            }
            catch (Exception)
            {
                Log("Pairing could not be completed.");
            }

            return PairingResult.Cancelled;
        }

        Log($"Pairing approved device_id={frame.DeviceId}");
        return PairingResult.Approved;
    }

    private async Task<PairingResult> CancelledAsync()
    {
        string? requestId;
        string? secret;
        Uri? baseUri;
        lock (_state)
        {
            if (_phase != PairingPhase.Approved)
            {
                _phase = PairingPhase.Cancelled;
            }

            requestId = _requestId;
            secret = _secret;
            baseUri = _baseUri;
            _requestId = null;
            _secret = null;
        }

        if (Phase == PairingPhase.Approved)
        {
            return PairingResult.Approved;
        }

        Log("Pairing cancelled");
        if (requestId is not null && secret is not null && baseUri is not null)
        {
            await SendCancelAsync(baseUri, requestId, secret).ConfigureAwait(false);
        }

        return PairingResult.Cancelled;
    }

    private async Task SendCancelAsync(Uri baseUri, string requestId, string secret)
    {
        lock (_state)
        {
            if (_cancelSent)
            {
                return;
            }

            _cancelSent = true;
        }

        try
        {
            await _api.CancelAsync(baseUri, requestId, secret, CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception)
        {
            Log("Pairing cancellation could not reach the relay");
        }
    }

    private PairingResult Finish(PairingPhase phase, PairingResult result, string message)
    {
        lock (_state)
        {
            if (_phase == PairingPhase.Cancelled)
            {
                return PairingResult.Cancelled;
            }

            _phase = phase;
            _error = null;
            _requestId = null;
            _secret = null;
        }

        Log(message);
        return result;
    }

    private PairingResult Fail(string message)
    {
        lock (_state)
        {
            if (_phase == PairingPhase.Cancelled)
            {
                return PairingResult.Cancelled;
            }

            _phase = PairingPhase.Failed;
            _error = message;
            _requestId = null;
            _secret = null;
        }

        Log(message);
        return PairingResult.Failed;
    }

    private static bool IsStorableCredential(string credential)
    {
        if (credential.Length == 0 || credential.Contains('\0'))
        {
            return false;
        }

        return Encoding.UTF8.GetByteCount(credential) <= WindowsCredentialStore.MaximumBlobBytes;
    }

    private void TryDeleteCredential()
    {
        try
        {
            _credentials.Delete();
        }
        catch (Exception)
        {
            Log("Pairing credential save failed");
        }
    }

    private async Task CloseTransportAsync()
    {
        IMessageTransport? transport;
        lock (_state)
        {
            transport = _transport;
            _transport = null;
        }

        if (transport is null)
        {
            return;
        }

        try
        {
            await transport.CloseAsync("client_close", CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception)
        {
            // The pairing socket is already unusable.
        }
    }

    private static PairRead Interpret(string json)
    {
        var parsed = ProtocolCodec.Parse(json);
        if (!parsed.IsSuccess || parsed.Frame is null)
        {
            return parsed.Failure switch
            {
                ProtocolParseFailure.UnknownType => new PairRead.Ignore(),
                ProtocolParseFailure.MalformedJson => new PairRead.Failed(),
                ProtocolParseFailure.InvalidMessage => new PairRead.Failed(),
                ProtocolParseFailure.UnsupportedVersion => new PairRead.Failed(),
                ProtocolParseFailure.UnknownAction => new PairRead.Failed(),
                _ => UnexpectedParse(parsed.Failure),
            };
        }

        return parsed.Frame switch
        {
            PairPendingFrame => new PairRead.Pending(),
            PairApprovedFrame approved => new PairRead.Approved(approved),
            PairRejectedFrame => new PairRead.Rejected(),
            PairExpiredFrame => new PairRead.Expired(),
            _ => new PairRead.Ignore(),
        };
    }

    private static PairRead UnexpectedParse(ProtocolParseFailure? failure) =>
        throw new InvalidOperationException($"Unhandled protocol parse failure {failure}.");

    private static PairingResult Unexpected(PairRead step) =>
        throw new InvalidOperationException($"Unhandled pairing step {step.GetType().Name}.");

    private static bool IsInFlight(PairingPhase phase) => phase switch
    {
        PairingPhase.CreatingRequest => true,
        PairingPhase.Connecting => true,
        PairingPhase.Authenticating => true,
        PairingPhase.PendingApproval => true,
        PairingPhase.Idle => false,
        PairingPhase.Approved => false,
        PairingPhase.Rejected => false,
        PairingPhase.Expired => false,
        PairingPhase.Cancelled => false,
        PairingPhase.Failed => false,
        _ => throw new InvalidOperationException($"Unhandled pairing phase {phase}."),
    };

    private void Log(string message)
    {
        AgentLog.Info(message);
        _log?.Invoke(message);
    }

    private abstract record PairRead
    {
        public sealed record Pending : PairRead;

        public sealed record Approved(PairApprovedFrame Frame) : PairRead;

        public sealed record Rejected : PairRead;

        public sealed record Expired : PairRead;

        public sealed record Failed : PairRead;

        public sealed record Ignore : PairRead;
    }
}
