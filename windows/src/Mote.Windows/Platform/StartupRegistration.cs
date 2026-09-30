using System.IO;

namespace Mote.Windows.Platform;

public readonly record struct StartupUpdate(bool Enabled, string? Error);

public static class StartupRegistration
{
    public const string FailureMessage = "Windows could not update the login startup entry.";

    public static StartupUpdate Apply(IStartupService startup, bool enable)
    {
        try
        {
            startup.SetEnabled(enable);
        }
        catch (Exception exception) when (exception is InvalidOperationException
            or UnauthorizedAccessException
            or IOException
            or System.Security.SecurityException)
        {
            return new StartupUpdate(SafeEnabled(startup), FailureMessage);
        }

        var enabled = SafeEnabled(startup);
        if (enable != enabled)
        {
            return new StartupUpdate(enabled, FailureMessage);
        }

        return new StartupUpdate(enabled, null);
    }

    private static bool SafeEnabled(IStartupService startup)
    {
        try
        {
            return startup.IsEnabled();
        }
        catch (Exception exception) when (exception is InvalidOperationException
            or UnauthorizedAccessException
            or IOException
            or System.Security.SecurityException)
        {
            return false;
        }
    }
}
