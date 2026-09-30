using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Mote.Windows.Networking;

public interface IPairingApi
{
    Task<PairCreated> CreateAsync(
        Uri relayBase,
        string deviceId,
        string deviceName,
        CancellationToken cancellationToken);

    Task CancelAsync(
        Uri relayBase,
        string requestId,
        string pairSecret,
        CancellationToken cancellationToken);
}

public sealed record PairCreated(string RequestId, string PairSecret, long ExpiresAt)
{
    public override string ToString() => $"pair_request id={RequestId}";
}

public sealed class PairingException : Exception
{
    public PairingException(string message)
        : base(message)
    {
    }
}

public sealed class HttpPairingApi : IPairingApi
{
    private readonly HttpClient _http;

    public HttpPairingApi(HttpClient http)
    {
        _http = http;
    }

    public async Task<PairCreated> CreateAsync(
        Uri relayBase,
        string deviceId,
        string deviceName,
        CancellationToken cancellationToken)
    {
        var uri = RelayAddress.PairRequests(relayBase);
        var body = JsonSerializer.Serialize(new PairCreateBody(deviceId, deviceName));
        using var content = new StringContent(body, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(uri, content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw Rejected(response);
        }

        var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return ReadCreated(text);
    }

    public async Task CancelAsync(
        Uri relayBase,
        string requestId,
        string pairSecret,
        CancellationToken cancellationToken)
    {
        var uri = RelayAddress.PairCancel(relayBase, requestId);
        var body = JsonSerializer.Serialize(new PairCancelBody(pairSecret));
        using var content = new StringContent(body, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(uri, content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw Rejected(response);
        }
    }

    private static PairingException Rejected(HttpResponseMessage response) =>
        new($"The relay rejected the pairing request (HTTP {(int)response.StatusCode}).");

    private static PairCreated ReadCreated(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (!TryString(root, "request_id", out var requestId)
                || !TryString(root, "pair_secret", out var pairSecret)
                || !root.TryGetProperty("expires_at", out var expires)
                || !expires.TryGetInt64(out var expiresAt))
            {
                throw new PairingException("The relay returned an invalid pairing response.");
            }

            return new PairCreated(requestId, pairSecret, expiresAt);
        }
        catch (PairingException)
        {
            throw;
        }
        catch (JsonException)
        {
            throw new PairingException("The relay returned an invalid pairing response.");
        }
    }

    private static bool TryString(JsonElement root, string name, out string value)
    {
        value = "";
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = element.GetString();
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        value = text;
        return true;
    }

    private sealed record PairCreateBody(
        [property: JsonPropertyName("device_id")] string DeviceId,
        [property: JsonPropertyName("device_name")] string DeviceName);

    private sealed record PairCancelBody(
        [property: JsonPropertyName("pair_secret")] string PairSecret)
    {
        public override string ToString() => "pair_cancel";
    }
}
