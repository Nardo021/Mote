using System.IO;

namespace Mote.Windows.Platform;

public static class LaunchCommand
{
    public const string BackgroundArgument = "--background";

    public static bool ShowsSettingsOnLaunch(bool isPrimary, bool background) =>
        isPrimary && !background;

    public static bool IsBackground(IReadOnlyList<string> args)
    {
        foreach (var arg in args)
        {
            if (string.Equals(arg, BackgroundArgument, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public static bool TryForCurrentProcess(out string command)
    {
        command = "";
        var path = Environment.ProcessPath;
        if (string.IsNullOrEmpty(path) || !IsSafeExecutable(path))
        {
            return false;
        }

        command = Format(path);
        return true;
    }

    public static bool IsSafeExecutable(string path)
    {
        var name = Path.GetFileName(path);
        return name.Equals("Mote.Windows.exe", StringComparison.OrdinalIgnoreCase);
    }

    public static string Format(string executablePath)
    {
        var sanitized = executablePath.Replace("\"", "", StringComparison.Ordinal);
        return "\"" + sanitized + "\" " + BackgroundArgument;
    }
}
