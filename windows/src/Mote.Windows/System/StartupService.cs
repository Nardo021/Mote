using Microsoft.Win32;

namespace Mote.Windows.Platform;

public interface IStartupService
{
    bool IsEnabled();

    void SetEnabled(bool enabled);
}

public interface IStartupStore
{
    string? Read(string name);

    void Write(string name, string value);

    void Remove(string name);
}

public sealed class CurrentUserRunKeyStore : IStartupStore
{
    public const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";

    public string? Read(string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey(KeyPath, writable: false);
        return key?.GetValue(name) as string;
    }

    public void Write(string name, string value)
    {
        using var key = Registry.CurrentUser.CreateSubKey(KeyPath, writable: true)
            ?? throw new InvalidOperationException("The per-user Run key is unavailable.");
        key.SetValue(name, value);
    }

    public void Remove(string name)
    {
        using var key = Registry.CurrentUser.OpenSubKey(KeyPath, writable: true);
        key?.DeleteValue(name, throwOnMissingValue: false);
    }
}

public sealed class PerUserStartupService : IStartupService
{
    public const string ValueName = "Mote";

    private readonly IStartupStore _store;
    private readonly string _command;

    public PerUserStartupService(string command, IStartupStore store)
    {
        _command = command;
        _store = store;
    }

    public static PerUserStartupService ForCurrentUser(string command) =>
        new(command, new CurrentUserRunKeyStore());

    public bool IsEnabled() =>
        string.Equals(_store.Read(ValueName), _command, StringComparison.Ordinal);

    public void SetEnabled(bool enabled)
    {
        if (enabled)
        {
            _store.Write(ValueName, _command);
            return;
        }

        _store.Remove(ValueName);
    }
}
