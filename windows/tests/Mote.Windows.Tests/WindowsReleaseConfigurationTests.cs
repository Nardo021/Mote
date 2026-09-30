namespace Mote.Windows.Tests;

public class WindowsReleaseConfigurationTests
{
    [Fact]
    public void PublishConfigurationIsSelfContainedSingleFileWithoutTrimming()
    {
        var project = File.ReadAllText(ProjectPath());

        Assert.Contains("<AssemblyName>Mote.Windows</AssemblyName>", project, StringComparison.Ordinal);
        Assert.Contains("<Product>Mote</Product>", project, StringComparison.Ordinal);
        Assert.Contains("<SelfContained>true</SelfContained>", project, StringComparison.Ordinal);
        Assert.Contains("<PublishSingleFile>true</PublishSingleFile>", project, StringComparison.Ordinal);
        Assert.Contains("<PublishTrimmed>false</PublishTrimmed>", project, StringComparison.Ordinal);
        Assert.Contains("<PublishReadyToRun>false</PublishReadyToRun>", project, StringComparison.Ordinal);
        Assert.Contains("<GenerateAssemblyCompanyAttribute>false</GenerateAssemblyCompanyAttribute>", project, StringComparison.Ordinal);
        Assert.DoesNotContain("PackageReference", project, StringComparison.Ordinal);
        Assert.DoesNotContain("win-arm64", project, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("win-x86", project, StringComparison.OrdinalIgnoreCase);

        var version = VersionElement(project);
        Assert.Matches(@"^\d+\.\d+\.\d+$", version);
        Assert.Contains($"<AssemblyVersion>{version}.0</AssemblyVersion>", project, StringComparison.Ordinal);
        Assert.Contains($"<FileVersion>{version}.0</FileVersion>", project, StringComparison.Ordinal);
        Assert.Contains($"<InformationalVersion>{version}</InformationalVersion>", project, StringComparison.Ordinal);
    }

    [Fact]
    public void WindowsReleaseWorkflowDoesNotOwnVersionTags()
    {
        var workflow = File.ReadAllText(Path.Combine(
            ProtocolFixtures.RepositoryRoot(), ".github", "workflows", "build-windows-release.yml"));
        var macos = File.ReadAllText(Path.Combine(
            ProtocolFixtures.RepositoryRoot(), ".github", "workflows", "release-macos.yml"));
        var ci = File.ReadAllText(Path.Combine(
            ProtocolFixtures.RepositoryRoot(), ".github", "workflows", "ci.yml"));

        Assert.Contains("workflow_dispatch:", workflow, StringComparison.Ordinal);
        Assert.Contains("workflow_call:", workflow, StringComparison.Ordinal);
        Assert.Contains("contents: read", workflow, StringComparison.Ordinal);
        Assert.Contains("-r win-x64", workflow, StringComparison.Ordinal);
        Assert.Contains("--self-contained true", workflow, StringComparison.Ordinal);
        Assert.Contains("UNSIGNED_RC", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("contents: write", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("gh release create", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("v[0-9]+.[0-9]+.[0-9]+", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("LockWorkStation", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("id-token:", workflow, StringComparison.Ordinal);

        Assert.Contains("v[0-9]+.[0-9]+.[0-9]+", macos, StringComparison.Ordinal);
        Assert.Contains("MARKETING_VERSION", macos, StringComparison.Ordinal);
        Assert.Contains("gh release create", macos, StringComparison.Ordinal);
        Assert.Contains("build-windows-release.yml", ci, StringComparison.Ordinal);
    }

    private static string VersionElement(string project)
    {
        const string open = "<Version>";
        var start = project.IndexOf(open, StringComparison.Ordinal);
        Assert.True(start >= 0);
        start += open.Length;
        var end = project.IndexOf("</Version>", start, StringComparison.Ordinal);
        Assert.True(end > start);
        return project[start..end].Trim();
    }

    private static string ProjectPath() =>
        Path.Combine(ProtocolFixtures.RepositoryRoot(), "windows", "src", "Mote.Windows", "Mote.Windows.csproj");
}
