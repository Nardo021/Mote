using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Mote.Windows.Actions;
using Mote.Windows.Commands;
using Mote.Windows.Networking;
using Mote.Windows.Protocol;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

internal static class SecretAssert
{
    public static void Equal(string expected, string? actual)
    {
        var same = actual is not null
            && actual.Length == expected.Length
            && CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(actual));
        Assert.True(same);
    }
}

internal static class TestWait
{
    public static async Task Until(Func<bool> condition)
    {
        var deadline = Environment.TickCount64 + 2000;
        while (!condition())
        {
            if (Environment.TickCount64 > deadline)
            {
                throw new TimeoutException("Condition was not met.");
            }

            await Task.Delay(10);
        }
    }
}

internal static class TestFrames
{
    public static string Command(
        string id,
        string deviceId,
        string action,
        long now,
        long? createdAt = null,
        long? expiresAt = null,
        string nonce = "nonce-1")
    {
        var created = createdAt ?? now;
        var expires = expiresAt ?? now + 10_000;
        return "{\"type\":\"command\",\"version\":1"
            + ",\"id\":\"" + id + "\""
            + ",\"device_id\":\"" + deviceId + "\""
            + ",\"action\":\"" + action + "\""
            + ",\"created_at\":" + created
            + ",\"expires_at\":" + expires
            + ",\"nonce\":\"" + nonce + "\"}";
    }

    public static string? TypeOf(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty("type", out var type) ? type.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static CommandResultFrame? ResultOf(string json)
    {
        var parsed = ProtocolCodec.Parse(json);
        return parsed.Frame as CommandResultFrame;
    }
}

internal sealed class MemoryCredentialStore : ICredentialStore
{
    public string? Value { get; set; }

    public int Reads { get; private set; }

    public int Saves { get; private set; }

    public bool FailSave { get; set; }

    public bool FailRead { get; set; }

    public string? Read()
    {
        Reads++;
        if (FailRead)
        {
            throw new CredentialStoreException("Credential Manager could not read the device credential.");
        }

        return Value;
    }

    public void Save(string credential)
    {
        if (FailSave)
        {
            throw new CredentialStoreException("Credential Manager rejected the device credential.");
        }

        Value = credential;
        Saves++;
    }

    public void Delete() => Value = null;
}

internal sealed class ManualDelay : IAsyncDelay
{
    private readonly object _gate = new();
    private readonly List<Waiter> _waiters = [];

    public Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested)
        {
            return Task.FromCanceled(cancellationToken);
        }

        var waiter = new Waiter(delay, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously));
        lock (_gate)
        {
            _waiters.Add(waiter);
        }

        cancellationToken.Register(() => waiter.Completion.TrySetCanceled(cancellationToken));
        return waiter.Completion.Task;
    }

    public bool IsPending(TimeSpan delay)
    {
        lock (_gate)
        {
            return _waiters.Any(waiter => waiter.Delay == delay && !waiter.Completion.Task.IsCompleted);
        }
    }

    public int CountPending(TimeSpan delay)
    {
        lock (_gate)
        {
            return _waiters.Count(waiter => waiter.Delay == delay && !waiter.Completion.Task.IsCompleted);
        }
    }

    public bool Release(TimeSpan delay)
    {
        Waiter? waiter;
        lock (_gate)
        {
            var index = _waiters.FindIndex(item => item.Delay == delay && !item.Completion.Task.IsCompleted);
            if (index < 0)
            {
                return false;
            }

            waiter = _waiters[index];
            _waiters.RemoveAt(index);
        }

        return waiter.Completion.TrySetResult();
    }

    public async Task<bool> ReleaseWhenPending(TimeSpan delay)
    {
        var deadline = Environment.TickCount64 + 2000;
        while (Environment.TickCount64 < deadline)
        {
            if (Release(delay))
            {
                return true;
            }

            await Task.Delay(10);
        }

        return false;
    }

    private sealed record Waiter(TimeSpan Delay, TaskCompletionSource Completion);
}

internal sealed class ScriptedTransport : IMessageTransport
{
    private readonly Channel<ScriptedItem> _incoming = Channel.CreateUnbounded<ScriptedItem>();
    private readonly List<string> _sent = [];
    private int _connected;

    public Uri? ConnectedUri { get; private set; }

    public bool IsClosed { get; private set; }

    public string? CloseReason { get; private set; }

    public Exception? ReceiveFailure { get; set; }

    public void Enqueue(string json) =>
        _incoming.Writer.TryWrite(new ScriptedItem.Message(Encoding.UTF8.GetBytes(json)));

    public void CloseFromRemote(string? reason) =>
        _incoming.Writer.TryWrite(new ScriptedItem.Closed(reason));

    public string[] Sent()
    {
        lock (_sent)
        {
            return _sent.ToArray();
        }
    }

    public Task ConnectAsync(Uri uri, CancellationToken cancellationToken)
    {
        ConnectedUri = uri;
        Volatile.Write(ref _connected, 1);
        return Task.CompletedTask;
    }

    public Task SendAsync(ReadOnlyMemory<byte> payload, CancellationToken cancellationToken)
    {
        if (Volatile.Read(ref _connected) == 0)
        {
            throw new TransportException(TransportFailure.NotConnected, "The relay socket is not connected.");
        }

        lock (_sent)
        {
            _sent.Add(Encoding.UTF8.GetString(payload.Span));
        }

        return Task.CompletedTask;
    }

    public async Task<byte[]> ReceiveAsync(CancellationToken cancellationToken)
    {
        if (Volatile.Read(ref _connected) == 0)
        {
            throw new TransportException(TransportFailure.NotConnected, "The relay socket is not connected.");
        }

        var failure = ReceiveFailure;
        if (failure is not null)
        {
            ReceiveFailure = null;
            throw failure;
        }

        var item = await _incoming.Reader.ReadAsync(cancellationToken).ConfigureAwait(false);
        return item switch
        {
            ScriptedItem.Message message => message.Payload,
            ScriptedItem.Closed closed => throw new TransportException(
                TransportFailure.Closed,
                "The relay socket closed.",
                closed.Reason),
            _ => throw new InvalidOperationException($"Unhandled scripted socket item {item.GetType().Name}."),
        };
    }

    public Task CloseAsync(string? reason, CancellationToken cancellationToken)
    {
        IsClosed = true;
        CloseReason = reason;
        return Task.CompletedTask;
    }

    private abstract record ScriptedItem
    {
        public sealed record Message(byte[] Payload) : ScriptedItem;

        public sealed record Closed(string? Reason) : ScriptedItem;
    }
}

internal sealed class ScriptedTransportFactory
{
    private readonly object _gate = new();

    public List<ScriptedTransport> Created { get; } = [];

    public Action<ScriptedTransport>? OnCreated { get; set; }

    public IMessageTransport Create()
    {
        var transport = new ScriptedTransport();
        OnCreated?.Invoke(transport);
        lock (_gate)
        {
            Created.Add(transport);
        }

        return transport;
    }

    public ScriptedTransport[] Snapshot()
    {
        lock (_gate)
        {
            return Created.ToArray();
        }
    }
}

internal sealed class FakePairingApi : IPairingApi
{
    public List<Uri> CreateUris { get; } = [];

    public List<(string DeviceId, string DeviceName)> Creates { get; } = [];

    public List<Uri> CancelUris { get; } = [];

    public List<string> CancelRequestIds { get; } = [];

    public int CancelCalls { get; private set; }

    public string? LastCancelSecret { get; private set; }

    public PairCreated Created { get; set; } = new("req-1", "pair-secret-value", 1_700_000_000_000);

    public Task<PairCreated> CreateAsync(
        Uri relayBase,
        string deviceId,
        string deviceName,
        CancellationToken cancellationToken)
    {
        CreateUris.Add(RelayAddress.PairRequests(relayBase));
        Creates.Add((deviceId, deviceName));
        return Task.FromResult(Created);
    }

    public Task CancelAsync(
        Uri relayBase,
        string requestId,
        string pairSecret,
        CancellationToken cancellationToken)
    {
        CancelCalls++;
        CancelRequestIds.Add(requestId);
        LastCancelSecret = pairSecret;
        CancelUris.Add(RelayAddress.PairCancel(relayBase, requestId));
        return Task.CompletedTask;
    }
}

internal sealed class SessionHarness : IDisposable
{
    public const string DeviceId = "88888888-8888-4888-8888-888888888888";

    public const string Credential = "device-credential";

    public const long Now = 1_700_000_000_000;

    public SessionHarness(bool lockSucceeds = true)
    {
        DirectoryPath = Directory.CreateTempSubdirectory("mote-w2").FullName;
        Store = new MemoryCredentialStore { Value = Credential };
        Settings = new SettingsStore(Path.Combine(DirectoryPath, "settings.json"), () => DeviceId, () => "Test-PC");
        Settings.Save(new AppSettings
        {
            DeviceId = DeviceId,
            DeviceName = "Test-PC",
            RelayUrl = "http://127.0.0.1:8787",
            WantsConnection = true,
        });
        Workstation = new FakeWorkstationLock { Succeeds = lockSucceeds };
        Delay = new ManualDelay();
        Transports = new ScriptedTransportFactory();
        var processor = new CommandProcessor(DeviceId, new LockAction(Workstation), () => Now);
        Client = new RelayClient(
            Transports.Create,
            () => Settings.Load().Settings,
            () => Store.Read(),
            processor.Process,
            new ReconnectPolicy(() => 0),
            Delay,
            () => Now,
            "0.1.0",
            message =>
            {
                lock (Logs)
                {
                    Logs.Add(message);
                }
            });
    }

    public string DirectoryPath { get; }

    public MemoryCredentialStore Store { get; }

    public SettingsStore Settings { get; }

    public FakeWorkstationLock Workstation { get; }

    public ManualDelay Delay { get; }

    public ScriptedTransportFactory Transports { get; }

    public RelayClient Client { get; }

    public List<string> Logs { get; } = [];

    public async Task ConnectAsync()
    {
        await Client.StartAsync();
        await TestWait.Until(() => Current().Sent().Length >= 1);
    }

    public async Task AuthenticateAsync()
    {
        await ConnectAsync();
        Current().Enqueue("""{"type":"auth_result","version":1,"status":"ok"}""");
        await TestWait.Until(() => Client.IsAuthenticated);
    }

    public ScriptedTransport Current() => Transports.Snapshot()[^1];

    public int HeartbeatCount() =>
        Transports.Snapshot().Sum(transport => transport.Sent().Count(frame => TestFrames.TypeOf(frame) == "heartbeat"));

    public void Dispose()
    {
        Client.StopAsync(intentional: true).GetAwaiter().GetResult();
        Directory.Delete(DirectoryPath, recursive: true);
    }
}
