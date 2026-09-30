using System.Reflection;

namespace Mote.Windows;

public static class AppVersion
{
    public static string Current { get; } =
        typeof(AppVersion).Assembly.GetName().Version?.ToString(3) ?? "2.0.0";
}
