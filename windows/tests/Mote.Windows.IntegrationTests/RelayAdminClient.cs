using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Mote.Windows.IntegrationTests;

internal sealed class RelayAdminClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly Uri _origin;
    private string? _cookie;

    public RelayAdminClient(Uri origin)
    {
        LoopbackGuard.Require(origin);
        _origin = origin;
        var handler = new HttpClientHandler { UseCookies = false };
        _http = new HttpClient(handler)
        {
            BaseAddress = origin,
            Timeout = TimeSpan.FromSeconds(25),
        };
    }

    public async Task LoginAsync(string username, string password, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["username"] = username,
            ["password"] = password,
        });
        using var response = await SendAsync(HttpMethod.Post, "/admin/api/session", body, cancellationToken)
            .ConfigureAwait(false);
        if (response.StatusCode != HttpStatusCode.OK)
        {
            throw AdminFailure("admin login", response.StatusCode);
        }

        if (!TryReadSessionCookie(response, out var cookie))
        {
            throw AdminFailure("admin login did not return a session cookie", response.StatusCode);
        }

        _cookie = cookie;
    }

    public async Task<IReadOnlyList<PendingPairRequest>> ListPendingPairRequestsAsync(CancellationToken cancellationToken)
    {
        using var response = await SendAsync(HttpMethod.Get, "/admin/api/pair-requests", json: null, cancellationToken)
            .ConfigureAwait(false);
        var text = await ReadSuccessAsync(response, "list pair requests").ConfigureAwait(false);
        using var document = JsonDocument.Parse(text);
        if (!document.RootElement.TryGetProperty("requests", out var requests) || requests.ValueKind != JsonValueKind.Array)
        {
            throw AdminFailure("pair request list is missing requests", response.StatusCode);
        }

        var pending = new List<PendingPairRequest>();
        foreach (var request in requests.EnumerateArray())
        {
            pending.Add(new PendingPairRequest(
                RequiredString(request, "id"),
                RequiredString(request, "device_id"),
                RequiredString(request, "device_name")));
        }

        return pending;
    }

    public async Task<string> ApproveAsync(string requestId, CancellationToken cancellationToken)
    {
        if (!IsSafeId(requestId))
        {
            throw new InvalidOperationException("Pair request id is not a safe path segment.");
        }

        using var response = await SendAsync(
                HttpMethod.Post,
                $"/admin/api/pair-requests/{requestId}/approve",
                "{}",
                cancellationToken)
            .ConfigureAwait(false);
        if (response.StatusCode != HttpStatusCode.OK)
        {
            throw AdminFailure("approve pair request", response.StatusCode);
        }

        var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        using var document = JsonDocument.Parse(text);
        if (!document.RootElement.TryGetProperty("device", out var device))
        {
            throw AdminFailure("approve response did not include a device", response.StatusCode);
        }

        return RequiredString(device, "id");
    }

    public async Task<AdminDeviceView> GetDeviceAsync(string deviceId, CancellationToken cancellationToken)
    {
        if (!IsSafeId(deviceId))
        {
            throw new InvalidOperationException("Device id is not a safe path segment.");
        }

        using var response = await SendAsync(HttpMethod.Get, $"/admin/api/devices/{deviceId}", json: null, cancellationToken)
            .ConfigureAwait(false);
        var text = await ReadSuccessAsync(response, "get device").ConfigureAwait(false);
        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        var actions = new List<string>();
        if (root.TryGetProperty("actions", out var actionValues) && actionValues.ValueKind == JsonValueKind.Array)
        {
            foreach (var action in actionValues.EnumerateArray())
            {
                if (action.ValueKind == JsonValueKind.String && action.GetString() is { } value)
                {
                    actions.Add(value);
                }
            }
        }

        return new AdminDeviceView(
            RequiredString(root, "id"),
            root.TryGetProperty("online", out var online) && online.ValueKind == JsonValueKind.True,
            OptionalString(root, "platform"),
            OptionalString(root, "app_version"),
            actions);
    }

    public async Task<CommandCompletion> SubmitLockAsync(string deviceId, CancellationToken cancellationToken)
    {
        if (!IsSafeId(deviceId))
        {
            throw new InvalidOperationException("Device id is not a safe path segment.");
        }

        using var response = await SendAsync(
                HttpMethod.Post,
                $"/admin/api/devices/{deviceId}/commands",
                """{"action":"lock"}""",
                cancellationToken)
            .ConfigureAwait(false);
        var text = await ReadSuccessAsync(response, "submit lock").ConfigureAwait(false);
        using var document = JsonDocument.Parse(text);
        var root = document.RootElement;
        int? duration = null;
        if (root.TryGetProperty("duration_ms", out var durationValue) && durationValue.ValueKind == JsonValueKind.Number)
        {
            duration = durationValue.GetInt32();
        }

        return new CommandCompletion(
            (int)response.StatusCode,
            RequiredString(root, "status"),
            RequiredString(root, "device_id"),
            OptionalString(root, "command_id"),
            duration);
    }

    public void Dispose() => _http.Dispose();

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        string? json,
        CancellationToken cancellationToken)
    {
        LoopbackGuard.Require(_origin);
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("Origin", _origin.GetLeftPart(UriPartial.Authority));
        if (_cookie is not null)
        {
            request.Headers.TryAddWithoutValidation("Cookie", _cookie);
        }

        if (json is not null)
        {
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        return await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<string> ReadSuccessAsync(HttpResponseMessage response, string operation)
    {
        var text = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw AdminFailure($"{operation} returned {(int)response.StatusCode}", response.StatusCode, text);
        }

        return text;
    }

    private static bool TryReadSessionCookie(HttpResponseMessage response, out string cookie)
    {
        cookie = "";
        if (!response.Headers.TryGetValues("Set-Cookie", out var values))
        {
            return false;
        }

        foreach (var value in values)
        {
            var pair = value.Split(';', 2)[0].Trim();
            if (pair.StartsWith("mote_admin_session=", StringComparison.Ordinal) && pair.Length > "mote_admin_session=".Length)
            {
                cookie = pair;
                return true;
            }
        }

        return false;
    }

    private static string RequiredString(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new InvalidOperationException($"Admin response is missing {name}.");
        }

        var text = value.GetString();
        if (string.IsNullOrEmpty(text))
        {
            throw new InvalidOperationException($"Admin response has an empty {name}.");
        }

        return text;
    }

    private static string? OptionalString(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return value.GetString();
    }

    private static bool IsSafeId(string value) =>
        value.Length is > 0 and <= 128 && value.All(static character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    private static InvalidOperationException AdminFailure(string message, HttpStatusCode status, string? body = null)
    {
        var safeBody = body is null ? "" : " " + E2ERedaction.Sanitize(body, password: null);
        return new InvalidOperationException($"{message} (HTTP {(int)status}).{safeBody}");
    }
}

internal sealed record PendingPairRequest(string Id, string DeviceId, string DeviceName);

internal sealed record AdminDeviceView(
    string Id,
    bool Online,
    string? Platform,
    string? AppVersion,
    IReadOnlyList<string> Actions);

internal sealed record CommandCompletion(
    int HttpStatus,
    string Status,
    string DeviceId,
    string? CommandId,
    int? DurationMilliseconds);
