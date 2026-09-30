using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using Mote.Windows.Networking;
using Mote.Windows.Protocol;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

public sealed class PairingClientTests : IDisposable
{
    private const string Secret = "pair-secret-value";
    private const string DeviceId = "88888888-8888-4888-8888-888888888888";

    private readonly string _directory = Directory.CreateTempSubdirectory("mote-w2-pair").FullName;
    private readonly SettingsStore _settings;
    private readonly MemoryCredentialStore _credentials = new();
    private readonly FakePairingApi _api = new();
    private readonly ScriptedTransportFactory _transports = new();
    private readonly List<string> _logs = [];
    private readonly PairingClient _client;

    public PairingClientTests()
    {
        _settings = new SettingsStore(Path.Combine(_directory, "settings.json"), () => DeviceId, () => "Test-PC");
        _settings.Save(new AppSettings
        {
            DeviceId = DeviceId,
            DeviceName = "Test-PC",
            RelayUrl = "http://127.0.0.1:8787",
            WantsConnection = true,
        });
        _client = new PairingClient(
            _api,
            _transports.Create,
            _settings,
            _credentials,
            message =>
            {
                lock (_logs)
                {
                    _logs.Add(message);
                }
            });
    }

    [Fact]
    public async Task PairRequestUsesTheRelayEndpoint()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue(Pending());
        transport.Enqueue(Approved());

        var result = await pairing;

        Assert.Equal(PairingResult.Approved, result);
        Assert.Equal("/v1/pair/requests", _api.CreateUris[0].AbsolutePath);
        Assert.Equal("", _api.CreateUris[0].Query);
        Assert.Equal(DeviceId, _api.Creates[0].DeviceId);
        Assert.Equal("Test-PC", _api.Creates[0].DeviceName);
    }

    [Fact]
    public async Task PairSocketUrlAndFirstFrameKeepTheSecretOutOfTheUrl()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        var uri = transport.ConnectedUri!;
        var frame = transport.Sent()[0];
        using var document = JsonDocument.Parse(frame);

        Assert.Equal(ProtocolConstants.PairWebSocketPath, uri.AbsolutePath);
        Assert.Equal("", uri.Query);
        Assert.DoesNotContain("pair_secret", uri.AbsoluteUri, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Secret, uri.AbsoluteUri, StringComparison.Ordinal);
        Assert.Equal("pair_auth", document.RootElement.GetProperty("type").GetString());
        Assert.Equal(1, document.RootElement.GetProperty("version").GetInt32());
        Assert.Equal("req-1", document.RootElement.GetProperty("request_id").GetString());
        SecretAssert.Equal(Secret, document.RootElement.GetProperty("pair_secret").GetString());
        Assert.Equal(1, transport.Sent().Count(item => item.Contains(Secret, StringComparison.Ordinal)));

        transport.Enqueue(Pending());
        await TestWait.Until(() => _client.Phase == PairingPhase.PendingApproval);
        transport.Enqueue(Approved());
        Assert.Equal(PairingResult.Approved, await pairing);
    }

    [Fact]
    public async Task ApprovalPersistsTheCredentialAndPendingDoesNot()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue(Pending());
        await TestWait.Until(() => _client.Phase == PairingPhase.PendingApproval);
        Assert.Equal(0, _credentials.Saves);
        transport.Enqueue(Approved("approved-credential", "99999999-9999-4999-8999-999999999999", "Window-PC"));

        Assert.Equal(PairingResult.Approved, await pairing);
        Assert.Equal(PairingPhase.Approved, _client.Phase);
        SecretAssert.Equal("approved-credential", _credentials.Value);
        Assert.Equal("99999999-9999-4999-8999-999999999999", _settings.Load().Settings.DeviceId);
        Assert.Equal("Window-PC", _settings.Load().Settings.DeviceName);
        Assert.DoesNotContain(
            "approved-credential",
            File.ReadAllText(Path.Combine(_directory, "settings.json")),
            StringComparison.Ordinal);
        Assert.True(transport.IsClosed);
    }

    [Fact]
    public async Task CredentialSaveFailureDoesNotClaimSuccess()
    {
        _credentials.FailSave = true;
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue(Approved());

        Assert.Equal(PairingResult.Failed, await pairing);
        Assert.Equal(PairingPhase.Failed, _client.Phase);
        Assert.Equal("The device credential could not be saved.", _client.Error);
        Assert.Null(_credentials.Value);
        Assert.Equal(DeviceId, _settings.Load().Settings.DeviceId);
    }

    [Fact]
    public async Task RejectionDoesNotSaveACredential()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue("""{"type":"pair_rejected","version":1,"error":"rejected"}""");

        Assert.Equal(PairingResult.Rejected, await pairing);
        Assert.Equal(PairingPhase.Rejected, _client.Phase);
        Assert.Equal(0, _credentials.Saves);
        Assert.Null(_credentials.Value);
    }

    [Fact]
    public async Task ExpiryDoesNotSaveACredential()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue("""{"type":"pair_expired","version":1}""");

        Assert.Equal(PairingResult.Expired, await pairing);
        Assert.Equal(0, _credentials.Saves);
    }

    [Fact]
    public async Task MalformedFrameFailsWithoutSaving()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue("{");

        Assert.Equal(PairingResult.Failed, await pairing);
        Assert.Equal(PairingPhase.Failed, _client.Phase);
        Assert.Equal(0, _credentials.Saves);
    }

    [Fact]
    public async Task UnsupportedVersionFailsWithoutSaving()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue("""{"type":"pair_pending","version":2}""");

        Assert.Equal(PairingResult.Failed, await pairing);
        Assert.Equal(0, _credentials.Saves);
        Assert.DoesNotContain(Secret, _client.Error ?? "", StringComparison.Ordinal);
    }

    [Fact]
    public async Task InvalidApprovalFailsWithoutSaving()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue(Approved("approved-credential", "not-a-uuid", "Window-PC"));

        Assert.Equal(PairingResult.Failed, await pairing);
        Assert.Equal(0, _credentials.Saves);
    }

    [Fact]
    public async Task CancellationClosesTheSessionAndNotifiesTheRelayOnce()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue(Pending());
        await TestWait.Until(() => _client.Phase == PairingPhase.PendingApproval);

        await _client.CancelAsync();
        await _client.CancelAsync();
        var result = await pairing;

        Assert.Equal(PairingResult.Cancelled, result);
        Assert.Equal(PairingPhase.Cancelled, _client.Phase);
        Assert.True(transport.IsClosed);
        Assert.Equal(1, _api.CancelCalls);
        Assert.Equal("req-1", _api.CancelRequestIds[0]);
        Assert.Equal("/v1/pair/requests/req-1/cancel", _api.CancelUris[0].AbsolutePath);
        Assert.Equal("", _api.CancelUris[0].Query);
        Assert.DoesNotContain(Secret, _api.CancelUris[0].AbsoluteUri, StringComparison.Ordinal);
        SecretAssert.Equal(Secret, _api.LastCancelSecret);
        Assert.Equal(0, _credentials.Saves);
    }

    [Fact]
    public async Task CancellingAnApprovedPairDoesNotDropTheCredential()
    {
        var pairing = _client.PairAsync();
        var transport = await WaitForAuthAsync();
        transport.Enqueue(Approved());
        Assert.Equal(PairingResult.Approved, await pairing);

        await _client.CancelAsync();

        Assert.Equal(0, _api.CancelCalls);
        SecretAssert.Equal("approved-credential", _credentials.Value);
        Assert.Equal(PairingPhase.Approved, _client.Phase);
    }

    [Fact]
    public async Task PairSecretDoesNotAppearInFailureLogs()
    {
        _transports.OnCreated = transport => transport.ReceiveFailure = new InvalidOperationException(Secret);
        var result = await _client.PairAsync();
        var logs = string.Join("\n", _logs);

        Assert.Equal(PairingResult.Failed, result);
        Assert.DoesNotContain(Secret, _client.Error ?? "", StringComparison.Ordinal);
        Assert.DoesNotContain(Secret, logs, StringComparison.Ordinal);
        Assert.Equal(0, _credentials.Saves);
    }

    public void Dispose()
    {
        Directory.Delete(_directory, recursive: true);
    }

    private async Task<ScriptedTransport> WaitForAuthAsync()
    {
        await TestWait.Until(() => _transports.Snapshot().Length == 1 && _transports.Snapshot()[0].Sent().Length == 1);
        return _transports.Snapshot()[0];
    }

    private static string Pending() => """{"type":"pair_pending","version":1}""";

    private static string Approved(
        string credential = "approved-credential",
        string deviceId = "99999999-9999-4999-8999-999999999999",
        string name = "Window-PC") =>
        "{\"type\":\"pair_approved\",\"version\":1"
        + ",\"device_id\":\"" + deviceId + "\""
        + ",\"credential\":\"" + credential + "\""
        + ",\"name\":\"" + name + "\"}";
}

public sealed class HttpPairingApiTests
{
    [Fact]
    public async Task CreateAndCancelMatchTheRelayContract()
    {
        const string secret = "http-pair-secret";
        var handler = new StubHandler
        {
            Responder = (_, _) => Json("""{"request_id":"req-9","pair_secret":"http-pair-secret","expires_at":1700000000000}"""),
        };
        var api = new HttpPairingApi(new HttpClient(handler));

        var created = await api.CreateAsync(
            new Uri("http://127.0.0.1:8787/ignored?pair_secret=leak"),
            "88888888-8888-4888-8888-888888888888",
            "Test-PC",
            CancellationToken.None);

        Assert.Equal(HttpMethod.Post, handler.Method);
        Assert.Equal("/v1/pair/requests", handler.Uri!.AbsolutePath);
        Assert.Equal("", handler.Uri.Query);
        Assert.DoesNotContain(secret, handler.Uri.AbsoluteUri, StringComparison.Ordinal);
        Assert.Contains("\"device_id\":\"88888888-8888-4888-8888-888888888888\"", handler.Body, StringComparison.Ordinal);
        Assert.Contains("\"device_name\":\"Test-PC\"", handler.Body, StringComparison.Ordinal);
        Assert.DoesNotContain(secret, handler.Body ?? "", StringComparison.Ordinal);
        Assert.Equal("req-9", created.RequestId);
        SecretAssert.Equal(secret, created.PairSecret);
        Assert.Equal(1_700_000_000_000, created.ExpiresAt);

        handler.Responder = (_, _) => Json("""{"ok":true}""");
        await api.CancelAsync(
            new Uri("http://127.0.0.1:8787"),
            "req-9",
            secret,
            CancellationToken.None);

        Assert.Equal("/v1/pair/requests/req-9/cancel", handler.Uri.AbsolutePath);
        Assert.Equal("", handler.Uri.Query);
        Assert.DoesNotContain(secret, handler.Uri.AbsoluteUri, StringComparison.Ordinal);
        Assert.Contains("\"pair_secret\":", handler.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task HttpFailureDoesNotCopyTheResponseBody()
    {
        const string secret = "body-secret-value";
        var handler = new StubHandler
        {
            Responder = (_, _) => new HttpResponseMessage(HttpStatusCode.Conflict)
            {
                Content = new StringContent("{\"error\":{\"code\":\"conflict\",\"message\":\"" + secret + "\"}}"),
            },
        };
        var api = new HttpPairingApi(new HttpClient(handler));

        var error = await Assert.ThrowsAsync<PairingException>(() => api.CreateAsync(
            new Uri("http://127.0.0.1:8787"),
            "88888888-8888-4888-8888-888888888888",
            "Test-PC",
            CancellationToken.None));

        Assert.Contains("HTTP 409", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(secret, error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(secret, error.ToString(), StringComparison.Ordinal);
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class StubHandler : HttpMessageHandler
    {
        public Func<HttpRequestMessage, string, HttpResponseMessage>? Responder { get; set; }

        public Uri? Uri { get; private set; }

        public HttpMethod? Method { get; private set; }

        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Uri = request.RequestUri;
            Method = request.Method;
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return Responder!(request, Body ?? "");
        }
    }
}
