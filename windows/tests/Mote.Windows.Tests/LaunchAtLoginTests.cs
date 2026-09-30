using Microsoft.Win32;
using Mote.Windows.Platform;
using Mote.Windows.Storage;
using Mote.Windows.Ui;

namespace Mote.Windows.Tests;

public sealed class LaunchAtLoginTests : IDisposable
{
    private readonly string? _productionValue;

    public LaunchAtLoginTests()
    {
        using var key = Registry.CurrentUser.OpenSubKey(CurrentUserRunKeyStore.KeyPath, writable: false);
        _productionValue = key?.GetValue(PerUserStartupService.ValueName) as string;
    }

    [Fact]
    public async Task EnableWritesTheQuotedBackgroundCommandAndDisableRemovesIt()
    {
        var store = new MemoryStartupStore();
        var command = LaunchCommand.Format(@"C:\Program Files\Mote\Mote.Windows.exe");
        var startup = new PerUserStartupService(command, store);
        using var desktop = new UiFixture();
        var model = new SettingsViewModel(desktop.Host.Agent, desktop.Settings, startup, launchAtLoginAvailable: true, "0.1.0");

        await model.SetLaunchAtLoginAsync(true);

        Assert.Equal("\"C:\\Program Files\\Mote\\Mote.Windows.exe\" --background", store.Read(PerUserStartupService.ValueName));
        Assert.True(startup.IsEnabled());
        Assert.True(desktop.Settings.Load().Settings.LaunchAtLogin);
        Assert.True(model.LaunchAtLogin);

        await model.SetLaunchAtLoginAsync(false);

        Assert.Null(store.Read(PerUserStartupService.ValueName));
        Assert.False(startup.IsEnabled());
        Assert.False(desktop.Settings.Load().Settings.LaunchAtLogin);
    }

    [Fact]
    public async Task FailedRegistrationDoesNotClaimSuccess()
    {
        var startup = new PerUserStartupService(
            LaunchCommand.Format(@"C:\Mote\Mote.Windows.exe"),
            new ThrowingStartupStore());
        using var desktop = new UiFixture();
        var model = new SettingsViewModel(desktop.Host.Agent, desktop.Settings, startup, launchAtLoginAvailable: true, "0.1.0");

        await model.SetLaunchAtLoginAsync(true);

        Assert.False(model.LaunchAtLogin);
        Assert.False(desktop.Settings.Load().Settings.LaunchAtLogin);
        Assert.Equal(StartupRegistration.FailureMessage, model.Notice);
        Assert.False(startup.IsEnabled());
    }

    [Fact]
    public void LoadMirrorsTheActualRegistration()
    {
        var store = new MemoryStartupStore();
        var command = LaunchCommand.Format(@"C:\Mote\Mote.Windows.exe");
        store.Write(PerUserStartupService.ValueName, command);
        var startup = new PerUserStartupService(command, store);
        using var desktop = new UiFixture();
        var model = new SettingsViewModel(desktop.Host.Agent, desktop.Settings, startup, launchAtLoginAvailable: true, "0.1.0");

        model.LoadEditor();

        Assert.True(model.LaunchAtLogin);
        Assert.True(desktop.Settings.Load().Settings.LaunchAtLogin);
    }

    [Fact]
    public async Task DotnetHostCannotRegisterStartup()
    {
        Assert.False(LaunchCommand.IsSafeExecutable(@"C:\Program Files\dotnet\dotnet.exe"));
        Assert.True(LaunchCommand.IsSafeExecutable(@"D:\Apps\Mote.Windows.exe"));
        using var desktop = new UiFixture();
        var model = new SettingsViewModel(
            desktop.Host.Agent,
            desktop.Settings,
            new DisabledStartupService(),
            launchAtLoginAvailable: false,
            "0.1.0");

        await model.SetLaunchAtLoginAsync(true);

        Assert.False(model.LaunchAtLogin);
        Assert.False(desktop.Settings.Load().Settings.LaunchAtLogin);
        Assert.Contains("dotnet", model.Notice, StringComparison.OrdinalIgnoreCase);
    }

    public void Dispose()
    {
        using var key = Registry.CurrentUser.OpenSubKey(CurrentUserRunKeyStore.KeyPath, writable: false);
        var after = key?.GetValue(PerUserStartupService.ValueName) as string;
        Assert.Equal(_productionValue, after);
    }
}

internal sealed class ThrowingStartupStore : IStartupStore
{
    public string? Read(string name) => null;

    public void Write(string name, string value) =>
        throw new UnauthorizedAccessException("denied");

    public void Remove(string name) =>
        throw new UnauthorizedAccessException("denied");
}
