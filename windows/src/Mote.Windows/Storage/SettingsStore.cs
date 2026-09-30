using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Mote.Windows.Storage;

public sealed record AppSettings
{
    public required string DeviceId { get; init; }

    public required string DeviceName { get; init; }

    public string? RelayUrl { get; init; }

    public bool WantsConnection { get; init; } = true;

    public bool LaunchAtLogin { get; init; }
}

public sealed record SettingsLoad(AppSettings Settings, bool RecoveredFromCorruption);

public sealed class SettingsStore
{
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _path;
    private readonly Func<string> _deviceIdFactory;
    private readonly Func<string> _deviceNameFactory;
    private AppSettings? _recovered;

    public SettingsStore(string path, Func<string>? deviceIdFactory = null, Func<string>? deviceNameFactory = null)
    {
        _path = path;
        _deviceIdFactory = deviceIdFactory ?? (() => Guid.NewGuid().ToString("D"));
        _deviceNameFactory = deviceNameFactory ?? DefaultDeviceName;
    }

    public SettingsStore()
        : this(DefaultFilePath)
    {
    }

    public static string DefaultFilePath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Mote",
        "settings.json");

    public SettingsLoad Load()
    {
        if (!File.Exists(_path))
        {
            var created = CreateDefault();
            Save(created);
            return new SettingsLoad(created, RecoveredFromCorruption: false);
        }

        string json;
        try
        {
            json = File.ReadAllText(_path);
        }
        catch (IOException)
        {
            return Recovered();
        }
        catch (UnauthorizedAccessException)
        {
            return Recovered();
        }

        if (!TryRead(json, out var settings) || settings is null)
        {
            return Recovered();
        }

        _recovered = null;
        return new SettingsLoad(settings, RecoveredFromCorruption: false);
    }

    public void Save(AppSettings settings)
    {
        if (!Guid.TryParse(settings.DeviceId, out _))
        {
            throw new ArgumentException("device_id must be a UUID.", nameof(settings));
        }

        var document = new SettingsDocument
        {
            DeviceId = settings.DeviceId,
            DeviceName = settings.DeviceName.Trim(),
            RelayUrl = string.IsNullOrWhiteSpace(settings.RelayUrl) ? null : settings.RelayUrl.Trim(),
            WantsConnection = settings.WantsConnection,
            LaunchAtLogin = settings.LaunchAtLogin,
        };
        if (document.DeviceName.Length == 0)
        {
            document.DeviceName = _deviceNameFactory();
        }

        WriteAtomic(JsonSerializer.Serialize(document, WriteOptions));
        _recovered = null;
    }

    private SettingsLoad Recovered()
    {
        _recovered ??= CreateDefault();
        return new SettingsLoad(_recovered, RecoveredFromCorruption: true);
    }

    private AppSettings CreateDefault() =>
        new()
        {
            DeviceId = _deviceIdFactory(),
            DeviceName = _deviceNameFactory(),
            RelayUrl = null,
            WantsConnection = true,
            LaunchAtLogin = false,
        };

    private static bool TryRead(string json, out AppSettings? settings)
    {
        settings = null;
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            var root = document.RootElement;
            if (!TryReadString(root, "device_id", out var deviceId) || !Guid.TryParse(deviceId, out _))
            {
                return false;
            }

            var deviceName = DefaultDeviceName();
            if (root.TryGetProperty("device_name", out var nameElement))
            {
                if (nameElement.ValueKind != JsonValueKind.String)
                {
                    return false;
                }

                var parsedName = nameElement.GetString()?.Trim() ?? "";
                if (parsedName.Length > 0)
                {
                    deviceName = parsedName;
                }
            }

            string? relayUrl = null;
            if (root.TryGetProperty("relay_url", out var relayElement))
            {
                if (relayElement.ValueKind == JsonValueKind.Null)
                {
                    relayUrl = null;
                }
                else if (relayElement.ValueKind != JsonValueKind.String)
                {
                    return false;
                }
                else
                {
                    var parsedRelay = relayElement.GetString()?.Trim() ?? "";
                    relayUrl = parsedRelay.Length == 0 ? null : parsedRelay;
                }
            }

            var wantsConnection = true;
            if (root.TryGetProperty("wants_connection", out var wantsElement))
            {
                if (wantsElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                {
                    return false;
                }

                wantsConnection = wantsElement.GetBoolean();
            }

            var launchAtLogin = false;
            if (root.TryGetProperty("launch_at_login", out var launchElement))
            {
                if (launchElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                {
                    return false;
                }

                launchAtLogin = launchElement.GetBoolean();
            }

            settings = new AppSettings
            {
                DeviceId = deviceId,
                DeviceName = deviceName,
                RelayUrl = relayUrl,
                WantsConnection = wantsConnection,
                LaunchAtLogin = launchAtLogin,
            };
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool TryReadString(JsonElement root, string name, out string value)
    {
        value = "";
        if (!root.TryGetProperty(name, out var element) || element.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var text = element.GetString();
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        value = text.Trim();
        return true;
    }

    private void WriteAtomic(string json)
    {
        var directory = Path.GetDirectoryName(_path);
        if (string.IsNullOrEmpty(directory))
        {
            throw new InvalidOperationException("Settings path has no directory.");
        }

        Directory.CreateDirectory(directory);
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, json);
        if (File.Exists(_path))
        {
            File.Replace(temporary, _path, destinationBackupFileName: null, ignoreMetadataErrors: true);
            return;
        }

        File.Move(temporary, _path);
    }

    private static string DefaultDeviceName()
    {
        var name = Environment.MachineName.Trim();
        return name.Length == 0 ? "Windows" : name;
    }

    private sealed class SettingsDocument
    {
        [JsonPropertyName("device_id")]
        public string DeviceId { get; set; } = "";

        [JsonPropertyName("device_name")]
        public string DeviceName { get; set; } = "";

        [JsonPropertyName("relay_url")]
        public string? RelayUrl { get; set; }

        [JsonPropertyName("wants_connection")]
        public bool WantsConnection { get; set; } = true;

        [JsonPropertyName("launch_at_login")]
        public bool LaunchAtLogin { get; set; }
    }
}
