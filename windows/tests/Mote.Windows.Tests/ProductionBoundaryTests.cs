namespace Mote.Windows.Tests;

public class ProductionBoundaryTests
{
    [Fact]
    public void ProductionProjectHasNoWindowsServiceOrAdministratorRequirement()
    {
        var project = ReadProduction("Mote.Windows.csproj");
        var manifest = ReadProduction("app.manifest");

        Assert.DoesNotContain("PackageReference", project, StringComparison.Ordinal);
        Assert.DoesNotContain("WindowsServices", project, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ServiceProcess", project, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("asInvoker", manifest, StringComparison.Ordinal);
        Assert.DoesNotContain("requireAdministrator", manifest, StringComparison.Ordinal);
        Assert.DoesNotContain("highestAvailable", manifest, StringComparison.Ordinal);

        foreach (var source in ProductionTexts())
        {
            Assert.DoesNotContain("ServiceBase", source, StringComparison.Ordinal);
            Assert.DoesNotContain("System.ServiceProcess", source, StringComparison.Ordinal);
            Assert.DoesNotContain("UseWindowsService", source, StringComparison.Ordinal);
            Assert.DoesNotContain("TaskScheduler", source, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void ProductionCodeHasNoShellOrPowerShellExecution()
    {
        foreach (var source in ProductionTexts())
        {
            Assert.DoesNotContain("Process.Start", source, StringComparison.Ordinal);
            Assert.DoesNotContain("ProcessStartInfo", source, StringComparison.Ordinal);
            Assert.DoesNotContain("powershell", source, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("rundll32", source, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("cmd.exe", source, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void CredentialBoundaryHasNoPlaintextPersistence()
    {
        var credential = ReadProduction(Path.Combine("Security", "CredentialStore.cs"));
        var startup = ReadProduction(Path.Combine("System", "StartupService.cs"));

        Assert.Contains("com.nardo021.mote/device_connection", credential, StringComparison.Ordinal);
        Assert.DoesNotContain("settings.json", credential, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ProtectedData", credential, StringComparison.Ordinal);
        Assert.DoesNotContain("LocalApplicationData", credential, StringComparison.Ordinal);
        Assert.DoesNotContain("File.Write", credential, StringComparison.Ordinal);
        Assert.Contains("Registry.CurrentUser", startup, StringComparison.Ordinal);
        Assert.DoesNotContain("LocalMachine", startup, StringComparison.Ordinal);
    }

    [Fact]
    public void LockUsesTheNativeBoundaryAndTestsDoNotCallIt()
    {
        var importToken = "Dll" + "Import";
        var construction = "new " + "Win32WorkstationLock";
        var imports = ProductionFiles("*.cs")
            .Where(path => File.ReadAllText(path).Contains(importToken, StringComparison.Ordinal))
            .ToArray();

        var import = Assert.Single(imports);
        var native = File.ReadAllText(import);
        Assert.Contains("user32.dll", native, StringComparison.Ordinal);
        Assert.Contains("Lock" + "WorkStation", native, StringComparison.Ordinal);

        foreach (var test in TestFiles())
        {
            var source = File.ReadAllText(test);
            Assert.DoesNotContain(importToken, source, StringComparison.Ordinal);
            Assert.DoesNotContain(construction, source, StringComparison.Ordinal);
        }
    }

    private static string ReadProduction(string relative) =>
        File.ReadAllText(Path.Combine(ProductionRoot(), relative));

    private static IEnumerable<string> ProductionTexts() =>
        ProductionFiles("*.*").Select(File.ReadAllText);

    private static IEnumerable<string> ProductionFiles(string pattern) =>
        Directory.EnumerateFiles(ProductionRoot(), pattern, SearchOption.AllDirectories)
            .Where(path => !IsGenerated(ProductionRoot(), path));

    private static IEnumerable<string> TestFiles() =>
        Directory.EnumerateFiles(TestRoot(), "*.cs", SearchOption.AllDirectories)
            .Where(path => !IsGenerated(TestRoot(), path));

    private static bool IsGenerated(string root, string path)
    {
        var relative = Path.GetRelativePath(root, path);
        return relative.StartsWith($"bin{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
            || relative.StartsWith($"obj{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase);
    }

    private static string ProductionRoot() =>
        Path.Combine(ProtocolFixtures.RepositoryRoot(), "windows", "src", "Mote.Windows");

    private static string TestRoot() =>
        Path.Combine(ProtocolFixtures.RepositoryRoot(), "windows", "tests", "Mote.Windows.Tests");
}
