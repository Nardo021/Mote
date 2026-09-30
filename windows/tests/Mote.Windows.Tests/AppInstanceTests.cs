using Mote.Windows.Platform;

namespace Mote.Windows.Tests;

public sealed class AppInstanceTests
{
    [Fact]
    public async Task FirstInstanceIsPrimaryAndAManualSecondIsRefused()
    {
        var name = InstanceName();
        using var primary = AppInstance.Acquire(name, requestSettings: false);
        var shows = 0;
        primary.ShowSettingsRequested += (_, _) => Interlocked.Increment(ref shows);

        var secondary = AppInstance.Acquire(name, requestSettings: true);
        var startedAgent = false;
        if (secondary.IsPrimary)
        {
            startedAgent = true;
        }

        await TestWait.Until(() => Volatile.Read(ref shows) == 1);
        Assert.True(primary.IsPrimary);
        Assert.False(secondary.IsPrimary);
        Assert.False(startedAgent);
        secondary.Dispose();
    }

    [Fact]
    public async Task BackgroundSecondInstanceDoesNotAskForSettings()
    {
        var name = InstanceName();
        using var primary = AppInstance.Acquire(name, requestSettings: false);
        var shows = 0;
        primary.ShowSettingsRequested += (_, _) => Interlocked.Increment(ref shows);

        using var secondary = AppInstance.Acquire(name, requestSettings: false);
        await Task.Delay(80);

        Assert.False(secondary.IsPrimary);
        Assert.Equal(0, Volatile.Read(ref shows));
    }

    [Fact]
    public void ReleasingThePrimaryLetsTheNextLaunchOwnTheInstance()
    {
        var name = InstanceName();
        var primary = AppInstance.Acquire(name, requestSettings: false);
        primary.Dispose();
        primary.Dispose();

        using var next = AppInstance.Acquire(name, requestSettings: false);
        Assert.True(next.IsPrimary);
    }

    [Fact]
    public void LaunchModeDecidesWhetherSettingsOpen()
    {
        Assert.True(LaunchCommand.ShowsSettingsOnLaunch(isPrimary: true, background: false));
        Assert.False(LaunchCommand.ShowsSettingsOnLaunch(isPrimary: true, background: true));
        Assert.False(LaunchCommand.ShowsSettingsOnLaunch(isPrimary: false, background: false));
        Assert.True(LaunchCommand.IsBackground(["--background"]));
        Assert.False(LaunchCommand.IsBackground(["--other"]));
    }

    private static string InstanceName() => "Mote.Test." + Guid.NewGuid().ToString("N");
}
