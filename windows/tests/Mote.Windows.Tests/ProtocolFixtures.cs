namespace Mote.Windows.Tests;

internal static class ProtocolFixtures
{
    public static string RepositoryRoot() =>
        Find(AppContext.BaseDirectory, Environment.GetEnvironmentVariable("MOTE_REPOSITORY_ROOT"));

    public static string Find(string startDirectory, string? environmentRoot)
    {
        if (!string.IsNullOrWhiteSpace(environmentRoot) && IsRoot(environmentRoot))
        {
            return Path.GetFullPath(environmentRoot);
        }

        var current = new DirectoryInfo(Path.GetFullPath(startDirectory));
        while (current is not null)
        {
            if (IsRoot(current.FullName))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not find protocol/catalogue.json above the test directory. Set MOTE_REPOSITORY_ROOT to the repository root.");
    }

    public static string FixturesDirectory() =>
        Path.Combine(RepositoryRoot(), "protocol", "fixtures");

    private static bool IsRoot(string path) =>
        File.Exists(Path.Combine(path, "protocol", "catalogue.json"))
        && File.Exists(Path.Combine(path, "protocol", "fixtures", "manifest.json"))
        && File.Exists(Path.Combine(path, "protocol", "fixtures", "auth-windows.json"));
}
