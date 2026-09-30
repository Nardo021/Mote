using System.Text.Json;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

public sealed class SettingsStoreTests : IDisposable
{
    private readonly string _directory = Directory.CreateTempSubdirectory("mote-w1-settings").FullName;

    [Fact]
    public void DefaultPathIsThePerUserMoteSettingsFile()
    {
        Assert.Equal(
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Mote",
                "settings.json"),
            SettingsStore.DefaultFilePath);
    }

    [Fact]
    public void FreshDefaultsPersistAUuidWithoutACredential()
    {
        var id = "11111111-1111-4111-8111-111111111111";
        var store = CreateStore(id);
        var loaded = store.Load();

        Assert.False(loaded.RecoveredFromCorruption);
        Assert.Equal(id, loaded.Settings.DeviceId);
        Assert.Equal("Test-PC", loaded.Settings.DeviceName);
        Assert.Null(loaded.Settings.RelayUrl);
        Assert.True(loaded.Settings.WantsConnection);
        Assert.False(loaded.Settings.LaunchAtLogin);
        AssertSettingsFile(id, "Test-PC", relayUrl: null, wantsConnection: true, launchAtLogin: false);
    }

    [Fact]
    public void UuidPersistsAcrossStoreInstances()
    {
        var id = "22222222-2222-4222-8222-222222222222";
        var calls = 0;
        var first = new SettingsStore(SettingsPath, () =>
        {
            calls++;
            return id;
        }, () => "Test-PC");
        Assert.Equal(id, first.Load().Settings.DeviceId);

        var second = new SettingsStore(SettingsPath, () => throw new InvalidOperationException("regenerated"), () => "Other");
        var loaded = second.Load();

        Assert.Equal(id, loaded.Settings.DeviceId);
        Assert.Equal("Test-PC", loaded.Settings.DeviceName);
        Assert.Equal(1, calls);
    }

    [Fact]
    public void CorruptedSettingsStayOnDiskAndDoNotThrow()
    {
        File.WriteAllText(SettingsPath, "{");
        var calls = 0;
        var store = new SettingsStore(SettingsPath, () =>
        {
            calls++;
            return "33333333-3333-4333-8333-333333333333";
        }, () => "Test-PC");

        var first = store.Load();
        var second = store.Load();

        Assert.True(first.RecoveredFromCorruption);
        Assert.Equal(first.Settings.DeviceId, second.Settings.DeviceId);
        Assert.Equal(1, calls);
        Assert.Equal("{", File.ReadAllText(SettingsPath));
    }

    [Fact]
    public void CredentialInASettingsFileIsNeverReloadedOrWritten()
    {
        const string secret = "settings-must-not-keep-this-secret";
        var id = "44444444-4444-4444-8444-444444444444";
        File.WriteAllText(SettingsPath, $$"""
            {
              "device_id": "{{id}}",
              "device_name": "Desk",
              "relay_url": "http://127.0.0.1:8787",
              "wants_connection": false,
              "launch_at_login": true,
              "credential": "{{secret}}"
            }
            """);

        var store = CreateStore("55555555-5555-4555-8555-555555555555");
        var loaded = store.Load();
        store.Save(loaded.Settings);

        Assert.Equal(id, loaded.Settings.DeviceId);
        Assert.Equal("Desk", loaded.Settings.DeviceName);
        var written = File.ReadAllText(SettingsPath);
        Assert.DoesNotContain(secret, written, StringComparison.Ordinal);
        Assert.DoesNotContain("credential", written, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(
            typeof(AppSettings).GetProperties(),
            property => property.Name.Contains("Credential", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void SaveAndLoadRoundTrip()
    {
        var id = "66666666-6666-4666-8666-666666666666";
        var store = CreateStore(id);
        var updated = store.Load().Settings with
        {
            DeviceName = "Office",
            RelayUrl = " http://127.0.0.1:8787 ",
            WantsConnection = false,
            LaunchAtLogin = true,
        };
        store.Save(updated);

        var loaded = new SettingsStore(SettingsPath).Load();

        Assert.False(loaded.RecoveredFromCorruption);
        Assert.Equal(id, loaded.Settings.DeviceId);
        Assert.Equal("Office", loaded.Settings.DeviceName);
        Assert.Equal("http://127.0.0.1:8787", loaded.Settings.RelayUrl);
        Assert.False(loaded.Settings.WantsConnection);
        Assert.True(loaded.Settings.LaunchAtLogin);
    }

    public void Dispose()
    {
        Directory.Delete(_directory, recursive: true);
    }

    private string SettingsPath => Path.Combine(_directory, "settings.json");

    private SettingsStore CreateStore(string deviceId) =>
        new(SettingsPath, () => deviceId, () => "Test-PC");

    private void AssertSettingsFile(
        string deviceId,
        string deviceName,
        string? relayUrl,
        bool wantsConnection,
        bool launchAtLogin)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(SettingsPath));
        var root = document.RootElement;
        var names = root.EnumerateObject().Select(property => property.Name).ToArray();
        foreach (var name in names)
        {
            Assert.Contains(name, AllowedNames);
        }

        Assert.DoesNotContain("credential", names, StringComparer.OrdinalIgnoreCase);
        Assert.Equal(deviceId, root.GetProperty("device_id").GetString());
        Assert.Equal(deviceName, root.GetProperty("device_name").GetString());
        Assert.Equal(wantsConnection, root.GetProperty("wants_connection").GetBoolean());
        Assert.Equal(launchAtLogin, root.GetProperty("launch_at_login").GetBoolean());
        Assert.Equal(relayUrl is null, !root.TryGetProperty("relay_url", out _));
    }

    private static readonly string[] AllowedNames =
    [
        "device_id",
        "device_name",
        "relay_url",
        "wants_connection",
        "launch_at_login",
    ];
}
