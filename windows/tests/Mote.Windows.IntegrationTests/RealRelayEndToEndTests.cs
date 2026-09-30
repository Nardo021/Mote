using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.IntegrationTests;

public sealed class RealRelayEndToEndTests
{
    private const string CredentialTargetPrefix = "com.nardo021.mote.e2e/";

    [Fact]
    public async Task PairApproveAuthenticateLockAndDisconnect()
    {
        var productionBefore = ProductionSettingsSnapshot.Capture();
        LocalWranglerRelay? relay = null;
        WindowsCredentialStore? credentials = null;
        string? settingsDirectory = null;
        AgentCoordinator? agent = null;
        var workstation = new RecordingWorkstationLock();
        var agentLogs = new List<string>();
        var previousSink = AgentLog.Sink;
        bool? sawOnline = null;
        Exception? failure = null;
        using var testTimeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        var cancellationToken = testTimeout.Token;

        try
        {
            AgentLog.Sink = message => agentLogs.Add(message);
            relay = await LocalWranglerRelay.StartAsync(cancellationToken);
            LoopbackGuard.Require(relay.BaseUri);

            var pairSocket = RelayAddress.PairWebSocket(relay.BaseUri);
            Assert.Equal(string.Empty, pairSocket.Query);
            Assert.Equal("/v1/ws/pair", pairSocket.AbsolutePath);
            Assert.DoesNotContain("pair_secret", pairSocket.AbsoluteUri, StringComparison.OrdinalIgnoreCase);

            settingsDirectory = Path.Combine(Path.GetTempPath(), "mote-w3-settings-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(settingsDirectory);
            var settingsPath = Path.Combine(settingsDirectory, "settings.json");
            Assert.False(IsProductionSettingsPath(settingsPath));

            var deviceId = Guid.NewGuid().ToString("D");
            const string deviceName = "Mote E2E Windows";
            var settings = new SettingsStore(settingsPath, () => deviceId, () => deviceName);
            var loaded = settings.Load().Settings;
            settings.Save(loaded with
            {
                RelayUrl = relay.BaseUri.GetLeftPart(UriPartial.Authority),
                WantsConnection = true,
            });

            var target = CredentialTargetPrefix + Guid.NewGuid().ToString("N");
            credentials = new WindowsCredentialStore(target);
            Assert.NotEqual(WindowsCredentialStore.TargetName, credentials.ActiveTargetName);
            Assert.StartsWith(CredentialTargetPrefix, credentials.ActiveTargetName, StringComparison.Ordinal);
            Assert.Null(credentials.Read());

            agent = new AgentCoordinator(settings, credentials, workstation, appVersion: "0.1.0");
            var pairTask = agent.PairAsync(cancellationToken);
            await WaitUntilAsync(
                    () => agent.Pairing.Phase == PairingPhase.PendingApproval || pairTask.IsCompleted,
                    TimeSpan.FromSeconds(20),
                    () => $"pairing did not reach pending approval (phase={agent.Pairing.Phase})",
                    cancellationToken);
            if (agent.Pairing.Phase != PairingPhase.PendingApproval)
            {
                var early = await pairTask;
                throw new InvalidOperationException($"Pairing ended before approval as {early} (phase={agent.Pairing.Phase}).");
            }

            using var admin = new RelayAdminClient(relay.BaseUri);
            await admin.LoginAsync(relay.AdminUsername, relay.AdminPassword, cancellationToken);
            PendingPairRequest? pending = null;
            var listDeadline = Environment.TickCount64 + 10_000;
            while (pending is null && Environment.TickCount64 < listDeadline)
            {
                var requests = await admin.ListPendingPairRequestsAsync(cancellationToken);
                pending = requests.FirstOrDefault(request => request.DeviceId == deviceId);
                if (pending is null)
                {
                    await Task.Delay(200, cancellationToken);
                }
            }

            if (pending is null)
            {
                throw new TimeoutException("The real relay did not list the Windows pair request.");
            }

            Assert.Equal(deviceName, pending.DeviceName);
            var approvedDeviceId = await admin.ApproveAsync(pending.Id, cancellationToken);
            Assert.Equal(deviceId, approvedDeviceId);
            var paired = await pairTask.WaitAsync(TimeSpan.FromSeconds(20), cancellationToken);
            Assert.Equal(PairingResult.Approved, paired);
            Assert.Equal(PairingPhase.Approved, agent.Pairing.Phase);

            var stored = credentials.Read();
            var readBack = credentials.Read();
            Assert.False(string.IsNullOrEmpty(stored));
            Assert.True(stored == readBack, "Credential Manager read-back did not match the saved credential.");
            var settingsText = await File.ReadAllTextAsync(settingsPath, cancellationToken);
            if (stored is not null && settingsText.Contains(stored, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("The isolated settings file contains the device credential.");
            }

            var approved = settings.Load().Settings;
            Assert.Equal(deviceId, approved.DeviceId);
            Assert.Equal(deviceName, approved.DeviceName);

            await WaitUntilAsync(
                    () => agent.Relay.IsAuthenticated && agent.Relay.Phase == ConnectionPhase.Connected,
                    TimeSpan.FromSeconds(20),
                    () => $"device session did not authenticate (phase={agent.Relay.Phase}, authenticated={agent.Relay.IsAuthenticated})",
                    cancellationToken);

            AdminDeviceView? online = null;
            var onlineDeadline = Environment.TickCount64 + 15_000;
            while (online is null && Environment.TickCount64 < onlineDeadline)
            {
                var device = await admin.GetDeviceAsync(deviceId, cancellationToken);
                if (device.Online)
                {
                    online = device;
                    sawOnline = true;
                }
                else
                {
                    await Task.Delay(200, cancellationToken);
                }
            }

            if (online is null)
            {
                sawOnline = false;
                throw new TimeoutException("The relay did not report the Windows device online.");
            }

            Assert.Equal(deviceId, online.Id);
            Assert.Equal("windows", online.Platform);
            Assert.Contains("lock", online.Actions);
            Assert.False(string.IsNullOrEmpty(online.AppVersion));
            Assert.Equal(0, workstation.Calls);

            var completion = await admin.SubmitLockAsync(deviceId, cancellationToken);
            Assert.Equal(200, completion.HttpStatus);
            Assert.Equal("completed", completion.Status);
            Assert.Equal(deviceId, completion.DeviceId);
            Assert.False(string.IsNullOrEmpty(completion.CommandId));
            if (completion.DurationMilliseconds is not { } durationMilliseconds)
            {
                throw new InvalidOperationException("Command response did not include duration_ms.");
            }

            Assert.InRange(durationMilliseconds, 0, 30_000);
            Assert.Equal(1, workstation.Calls);

            await agent.DisconnectAsync(cancellationToken).WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            Assert.Equal(ConnectionPhase.Disconnected, agent.Relay.Phase);
            Assert.False(agent.Relay.IsAuthenticated);

            var offline = false;
            var offlineDeadline = Environment.TickCount64 + 15_000;
            while (!offline && Environment.TickCount64 < offlineDeadline)
            {
                var device = await admin.GetDeviceAsync(deviceId, cancellationToken);
                offline = !device.Online;
                if (!offline)
                {
                    await Task.Delay(200, cancellationToken);
                }
            }

            if (!offline)
            {
                throw new TimeoutException("The relay did not report the Windows device offline after disconnect.");
            }

            await Task.Delay(TimeSpan.FromSeconds(3), cancellationToken);
            Assert.Equal(ConnectionPhase.Disconnected, agent.Relay.Phase);
            var still = await admin.GetDeviceAsync(deviceId, cancellationToken);
            Assert.False(still.Online);
            Assert.Equal(1, workstation.Calls);

            var joinedLogs = string.Join('\n', agentLogs);
            if (joinedLogs.Contains("pair_secret", StringComparison.OrdinalIgnoreCase)
                || joinedLogs.Contains(relay.AdminPassword, StringComparison.Ordinal)
                || E2ERedaction.ContainsExposedSecret(joinedLogs)
                || relay.CapturedLogExposesSecret())
            {
                throw new InvalidOperationException("A secret value was present in captured logs.");
            }

            if (relay.SanitizedLogTail().Contains("/cancel", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Successful pairing used the HTTP pair cancel route.");
            }
        }
        catch (Exception exception)
        {
            failure = exception;
        }
        finally
        {
            AgentLog.Sink = previousSink;
            if (agent is not null)
            {
                try
                {
                    await agent.ShutdownAsync().WaitAsync(TimeSpan.FromSeconds(5));
                }
                catch (Exception)
                {
                    // Cleanup still deletes the credential, settings, and Wrangler process.
                }
            }

            try
            {
                credentials?.Delete();
            }
            catch (CredentialStoreException)
            {
                // The isolated target may never have been written.
            }

            if (relay is not null)
            {
                await relay.DisposeAsync();
            }

            if (settingsDirectory is not null)
            {
                try
                {
                    if (Directory.Exists(settingsDirectory))
                    {
                        Directory.Delete(settingsDirectory, recursive: true);
                    }
                }
                catch (IOException)
                {
                    // Reported below if the directory survives.
                }
            }
        }

        string? cleanup = null;
        try
        {
            productionBefore.AssertUnchanged();
            if (credentials?.Read() is not null)
            {
                cleanup = "The isolated Credential Manager entry was still present after cleanup.";
            }

            if (settingsDirectory is not null && Directory.Exists(settingsDirectory))
            {
                cleanup = "The isolated settings directory was still present after cleanup.";
            }
        }
        catch (Exception exception)
        {
            cleanup = exception.Message;
        }

        if (failure is not null || cleanup is not null)
        {
            var password = relay?.AdminPassword;
            var detail = E2ERedaction.Sanitize(failure?.ToString(), password);
            var phase = agent is null
                ? "agent was not created"
                : $"pairing={agent.Pairing.Phase} connection={agent.Relay.Phase} authenticated={agent.Relay.IsAuthenticated} lockCalls={workstation.Calls} sawOnline={sawOnline}";
            var log = relay is null ? "" : relay.SanitizedLogTail();
            throw new Xunit.Sdk.XunitException($"{detail}{Environment.NewLine}{cleanup}{Environment.NewLine}{phase}{Environment.NewLine}{log}");
        }
    }

    private static bool IsProductionSettingsPath(string path)
    {
        var production = Path.GetFullPath(SettingsStore.DefaultFilePath);
        return Path.GetFullPath(path).Equals(production, StringComparison.OrdinalIgnoreCase);
    }

    private static async Task WaitUntilAsync(
        Func<bool> condition,
        TimeSpan timeout,
        Func<string> failure,
        CancellationToken cancellationToken)
    {
        var deadline = Environment.TickCount64 + (long)timeout.TotalMilliseconds;
        while (!condition())
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (Environment.TickCount64 >= deadline)
            {
                throw new TimeoutException(failure());
            }

            await Task.Delay(100, cancellationToken);
        }
    }
}

internal sealed class ProductionSettingsSnapshot
{
    private readonly bool _exists;
    private readonly IReadOnlyList<(string Path, DateTime WrittenUtc, long Length)> _files;

    private ProductionSettingsSnapshot(bool exists, IReadOnlyList<(string, DateTime, long)> files)
    {
        _exists = exists;
        _files = files;
    }

    public static ProductionSettingsSnapshot Capture()
    {
        var directory = Path.GetDirectoryName(SettingsStore.DefaultFilePath)
            ?? throw new InvalidOperationException("Production settings directory is unavailable.");
        if (!Directory.Exists(directory))
        {
            return new ProductionSettingsSnapshot(exists: false, []);
        }

        var files = Directory.GetFiles(directory, "*", SearchOption.AllDirectories)
            .Select(path => (path, File.GetLastWriteTimeUtc(path), new FileInfo(path).Length))
            .OrderBy(file => file.path, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return new ProductionSettingsSnapshot(exists: true, files);
    }

    public void AssertUnchanged()
    {
        var after = Capture();
        if (_exists != after._exists || _files.Count != after._files.Count)
        {
            throw new InvalidOperationException("Production settings directory changed during E2E.");
        }

        for (var index = 0; index < _files.Count; index++)
        {
            if (!string.Equals(_files[index].Path, after._files[index].Path, StringComparison.OrdinalIgnoreCase)
                || _files[index].WrittenUtc != after._files[index].WrittenUtc
                || _files[index].Length != after._files[index].Length)
            {
                throw new InvalidOperationException("Production settings directory changed during E2E.");
            }
        }
    }
}
