using System.Reflection;

namespace Mote.Windows;

public static class AppVersion
{
    public static string Current { get; } =
        typeof(AppVersion).Assembly.GetName().Version?.ToString(3) ?? "0.1.0";
}
