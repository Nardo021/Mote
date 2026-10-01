using System.Buffers.Binary;

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
        var product = File.ReadAllText(Path.Combine(
            ProtocolFixtures.RepositoryRoot(), ".github", "workflows", "release.yml"));
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

        Assert.Contains("workflow_call:", macos, StringComparison.Ordinal);
        Assert.Contains("MARKETING_VERSION", macos, StringComparison.Ordinal);
        Assert.Contains("notarytool", macos, StringComparison.Ordinal);
        Assert.DoesNotContain("gh release create", macos, StringComparison.Ordinal);
        Assert.Contains("v[0-9]+.[0-9]+.[0-9]+", product, StringComparison.Ordinal);
        Assert.Contains("gh release create", product, StringComparison.Ordinal);
        Assert.Contains("contents: write", product, StringComparison.Ordinal);
        Assert.Contains("build-windows-release.yml", ci, StringComparison.Ordinal);
    }

    [Fact]
    public void ApplicationIconIsTheCanonicalMoteArtwork()
    {
        var root = ProtocolFixtures.RepositoryRoot();
        var project = File.ReadAllText(ProjectPath());
        const string iconElement = "<ApplicationIcon>Resources\\Mote.ico</ApplicationIcon>";
        Assert.Contains(iconElement, project, StringComparison.Ordinal);
        Assert.Contains("<AssemblyName>Mote.Windows</AssemblyName>", project, StringComparison.Ordinal);
        Assert.DoesNotContain("Mote.ico", project.Replace(iconElement, "", StringComparison.Ordinal), StringComparison.Ordinal);
        Assert.DoesNotContain("CopyToOutputDirectory", project, StringComparison.Ordinal);

        var iconPath = Path.Combine(root, "windows", "src", "Mote.Windows", "Resources", "Mote.ico");
        Assert.True(File.Exists(iconPath));
        var images = ReadIco(File.ReadAllBytes(iconPath));
        Assert.Equal(new[] { 16, 32, 64, 128, 256 }, images.Select(image => image.Size).ToArray());

        var catalog = Path.Combine(root, "macos", "Mote", "Resources", "Assets.xcassets", "AppIcon.appiconset");
        var sources = new Dictionary<int, string>
        {
            [16] = "icon_16x16.png",
            [32] = "icon_32x32.png",
            [64] = "icon_32x32@2x.png",
            [128] = "icon_128x128.png",
            [256] = "icon_256x256.png",
        };
        var contents = File.ReadAllText(Path.Combine(catalog, "Contents.json"));
        foreach (var image in images)
        {
            var sourceName = sources[image.Size];
            Assert.Contains($"\"filename\": \"{sourceName}\"", contents, StringComparison.Ordinal);
            var source = File.ReadAllBytes(Path.Combine(catalog, sourceName));
            Assert.Equal(source, image.Png);
            var (width, height) = PngSize(source);
            Assert.Equal(image.Size, width);
            Assert.Equal(image.Size, height);
        }

        var readmeIcon = File.ReadAllBytes(Path.Combine(root, "docs", "mote-icon.png"));
        Assert.Equal(File.ReadAllBytes(Path.Combine(catalog, "icon_256x256.png")), readmeIcon);

        var package = File.ReadAllText(Path.Combine(root, "scripts", "package-windows-release.ps1"));
        Assert.Contains("\".ico\"", package, StringComparison.Ordinal);
        Assert.Contains("Mote.Windows.exe", package, StringComparison.Ordinal);
        Assert.Contains("Single-file ZIP must contain only Mote.Windows.exe.", package, StringComparison.Ordinal);

        var tray = File.ReadAllText(Path.Combine(root, "windows", "src", "Mote.Windows", "Ui", "NotifyIconTray.cs"));
        Assert.Contains("ExtractAssociatedIcon", tray, StringComparison.Ordinal);
        Assert.DoesNotContain("Mote.ico", tray, StringComparison.Ordinal);

        var settings = File.ReadAllText(Path.Combine(root, "windows", "src", "Mote.Windows", "SettingsWindow.xaml"));
        Assert.DoesNotContain("Icon=", settings, StringComparison.Ordinal);
        Assert.DoesNotContain("favicon", settings, StringComparison.OrdinalIgnoreCase);

        var workflow = File.ReadAllText(Path.Combine(root, ".github", "workflows", "build-windows-release.yml"));
        Assert.Contains("build-windows-icon.mjs --check", workflow, StringComparison.Ordinal);
        Assert.Contains("build-windows-icon.mjs --verify-exe", workflow, StringComparison.Ordinal);
        Assert.DoesNotContain("LockWorkStation", workflow, StringComparison.Ordinal);
    }

    private static List<(int Size, byte[] Png)> ReadIco(byte[] ico)
    {
        Assert.True(ico.Length >= 6);
        Assert.Equal(0, BinaryPrimitives.ReadUInt16LittleEndian(ico));
        Assert.Equal(1, BinaryPrimitives.ReadUInt16LittleEndian(ico.AsSpan(2)));
        var count = BinaryPrimitives.ReadUInt16LittleEndian(ico.AsSpan(4));
        Assert.Equal(5, count);
        var images = new List<(int Size, byte[] Png)>();
        var cursor = 6 + 16 * count;
        for (var index = 0; index < count; index++)
        {
            var at = 6 + index * 16;
            var size = ico[at] == 0 ? 256 : ico[at];
            Assert.Equal(size, ico[at + 1] == 0 ? 256 : ico[at + 1]);
            Assert.Equal(0, ico[at + 2]);
            Assert.Equal(0, ico[at + 3]);
            Assert.Equal(1, BinaryPrimitives.ReadUInt16LittleEndian(ico.AsSpan(at + 4)));
            Assert.Equal(32, BinaryPrimitives.ReadUInt16LittleEndian(ico.AsSpan(at + 6)));
            var length = BinaryPrimitives.ReadInt32LittleEndian(ico.AsSpan(at + 8));
            var offset = BinaryPrimitives.ReadInt32LittleEndian(ico.AsSpan(at + 12));
            Assert.Equal(cursor, offset);
            Assert.True(length > 24);
            Assert.True(offset + length <= ico.Length);
            images.Add((size, ico[offset..(offset + length)]));
            cursor += length;
        }

        Assert.Equal(ico.Length, cursor);
        return images;
    }

    private static (int Width, int Height) PngSize(byte[] png)
    {
        Assert.True(png.Length > 24);
        Assert.Equal(0x89, png[0]);
        Assert.Equal((byte)'P', png[1]);
        Assert.Equal((byte)'N', png[2]);
        Assert.Equal((byte)'G', png[3]);
        Assert.Equal((byte)'I', png[12]);
        Assert.Equal((byte)'H', png[13]);
        Assert.Equal((byte)'D', png[14]);
        Assert.Equal((byte)'R', png[15]);
        var width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
        var height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
        return (width, height);
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
