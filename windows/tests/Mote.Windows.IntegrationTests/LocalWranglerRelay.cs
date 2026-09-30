using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Mote.Windows.IntegrationTests;

internal sealed class LocalWranglerRelay : IAsyncDisposable
{
    private const int StartupTimeoutMilliseconds = 90_000;
    private readonly Process _process;
    private readonly StringBuilder _log = new();
    private readonly object _logGate = new();
    private readonly string _envFile;

    private LocalWranglerRelay(Process process, Uri baseUri, string persistenceDirectory, string envFile, string adminPassword)
    {
        _process = process;
        _envFile = envFile;
        BaseUri = baseUri;
        PersistenceDirectory = persistenceDirectory;
        AdminPassword = adminPassword;
    }

    public Uri BaseUri { get; }

    public string PersistenceDirectory { get; }

    public string AdminUsername { get; } = "admin";

    public string AdminPassword { get; }

    public static async Task<LocalWranglerRelay> StartAsync(CancellationToken cancellationToken)
    {
        var root = FindRepositoryRoot();
        var assets = Path.Combine(root, "dashboard", "dist");
        if (!Directory.Exists(assets) || !File.Exists(Path.Combine(assets, "index.html")))
        {
            throw new InvalidOperationException("Dashboard assets are missing. Run npm run build --prefix dashboard before Windows E2E.");
        }

        var script = Path.Combine(root, "node_modules", "wrangler", "bin", "wrangler.js");
        if (!File.Exists(script))
        {
            throw new InvalidOperationException("Wrangler is not installed. Run npm ci at the repository root.");
        }

        var port = FreeTcpPort();
        var inspectorPort = FreeTcpPort();
        var origin = new Uri($"http://127.0.0.1:{port}");
        LoopbackGuard.Require(origin);

        var persistenceDirectory = Path.Combine(Path.GetTempPath(), "mote-w3-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(persistenceDirectory);
        var password = CreatePassword();
        var envFile = Path.Combine(persistenceDirectory, "e2e.env");
        await File.WriteAllTextAsync(
                envFile,
                $"MOTE_ADMIN_PASSWORD={password}{Environment.NewLine}MOTE_PUBLIC_URL={origin.GetLeftPart(UriPartial.Authority)}{Environment.NewLine}",
                cancellationToken)
            .ConfigureAwait(false);

        var start = new ProcessStartInfo
        {
            FileName = "node",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.ArgumentList.Add(script);
        start.ArgumentList.Add("dev");
        start.ArgumentList.Add("--local");
        start.ArgumentList.Add("--ip");
        start.ArgumentList.Add("127.0.0.1");
        start.ArgumentList.Add("--port");
        start.ArgumentList.Add(port.ToString());
        start.ArgumentList.Add("--inspector-port");
        start.ArgumentList.Add(inspectorPort.ToString());
        start.ArgumentList.Add("--persist-to");
        start.ArgumentList.Add(persistenceDirectory);
        start.ArgumentList.Add("--env-file");
        start.ArgumentList.Add(envFile);
        start.ArgumentList.Add("--var");
        start.ArgumentList.Add($"MOTE_PUBLIC_URL:{origin.GetLeftPart(UriPartial.Authority)}");
        start.ArgumentList.Add("--no-show-interactive-dev-session");
        start.ArgumentList.Add("--log-level");
        start.ArgumentList.Add("info");
        start.ArgumentList.Add("--no-latest");
        start.Environment["WRANGLER_SEND_METRICS"] = "false";
        start.Environment["CI"] = "true";
        start.Environment["CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV"] = "true";
        start.Environment.Remove("CLOUDFLARE_API_TOKEN");
        start.Environment.Remove("CLOUDFLARE_API_KEY");
        start.Environment.Remove("CLOUDFLARE_ACCOUNT_ID");

        var process = new Process { StartInfo = start, EnableRaisingEvents = true };
        var relay = new LocalWranglerRelay(process, origin, persistenceDirectory, envFile, password);
        process.OutputDataReceived += (_, eventArgs) => relay.Append(eventArgs.Data);
        process.ErrorDataReceived += (_, eventArgs) => relay.Append(eventArgs.Data);
        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException("Wrangler process did not start.");
            }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await relay.WaitUntilHealthyAsync(cancellationToken).ConfigureAwait(false);
            return relay;
        }
        catch
        {
            await relay.DisposeAsync().ConfigureAwait(false);
            throw;
        }
    }

    public bool CapturedLogExposesSecret()
    {
        string text;
        lock (_logGate)
        {
            text = _log.ToString();
        }

        return text.Contains(AdminPassword, StringComparison.Ordinal) || E2ERedaction.ContainsExposedSecret(text);
    }

    public string SanitizedLogTail()
    {
        string text;
        lock (_logGate)
        {
            text = _log.ToString();
        }

        var sanitized = E2ERedaction.Sanitize(text, AdminPassword);
        const int max = 4_000;
        return sanitized.Length <= max ? sanitized : sanitized[^max..];
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.Kill(entireProcessTree: true);
                _process.WaitForExit(5_000);
            }
        }
        catch (InvalidOperationException)
        {
            // The process had already exited.
        }
        finally
        {
            _process.Dispose();
        }

        EraseFile(_envFile);
        DeleteDirectory(PersistenceDirectory);
        await Task.CompletedTask.ConfigureAwait(false);
    }

    private async Task WaitUntilHealthyAsync(CancellationToken cancellationToken)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        var health = new Uri(BaseUri, "/health");
        var deadline = Environment.TickCount64 + StartupTimeoutMilliseconds;
        while (Environment.TickCount64 < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (_process.HasExited)
            {
                throw new InvalidOperationException(
                    $"Wrangler exited early with code {_process.ExitCode}.{Environment.NewLine}{SanitizedLogTail()}");
            }

            try
            {
                using var response = await http.GetAsync(health, cancellationToken).ConfigureAwait(false);
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                    if (IsHealthy(body))
                    {
                        return;
                    }
                }
            }
            catch (HttpRequestException)
            {
                // The listener is not accepting connections yet.
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                // A single health probe timed out. Keep polling until the startup deadline.
            }

            await Task.Delay(250, cancellationToken).ConfigureAwait(false);
        }

        throw new TimeoutException($"Wrangler did not become healthy.{Environment.NewLine}{SanitizedLogTail()}");
    }

    private static bool IsHealthy(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.TryGetProperty("status", out var status)
                && status.ValueKind == JsonValueKind.String
                && status.GetString() == "ok";
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private void Append(string? line)
    {
        if (line is null)
        {
            return;
        }

        lock (_logGate)
        {
            _log.AppendLine(line);
            if (_log.Length > 200_000)
            {
                _log.Remove(0, _log.Length - 100_000);
            }
        }
    }

    private static int FreeTcpPort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static string CreatePassword()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        var bytes = RandomNumberGenerator.GetBytes(32);
        var chars = new char[bytes.Length];
        for (var index = 0; index < bytes.Length; index++)
        {
            chars[index] = alphabet[bytes[index] % alphabet.Length];
        }

        return new string(chars);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "wrangler.jsonc")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("Could not find the repository root.");
    }

    private static void EraseFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.WriteAllText(path, "");
                File.Delete(path);
            }
        }
        catch (IOException)
        {
            // Directory deletion retries the same tree.
        }
    }

    private static void DeleteDirectory(string path)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, recursive: true);
                }

                return;
            }
            catch (IOException) when (attempt < 4)
            {
                Thread.Sleep(200);
            }
        }
    }
}
