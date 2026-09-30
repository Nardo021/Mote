using System.Text.Json;
using System.Text.Json.Nodes;
using Mote.Windows.Protocol;

namespace Mote.Windows.Tests;

public class ProtocolFixtureTests
{
    [Fact]
    public void FindsCanonicalFixturesByWalkingUpFromTheTestOutput()
    {
        var root = ProtocolFixtures.RepositoryRoot();
        var auth = Path.Combine(ProtocolFixtures.FixturesDirectory(), "auth-windows.json");

        Assert.True(File.Exists(Path.Combine(root, "protocol", "catalogue.json")));
        Assert.Equal(Path.Combine(root, "protocol", "fixtures", "auth-windows.json"), auth);
        Assert.DoesNotContain(
            $"{Path.DirectorySeparatorChar}windows{Path.DirectorySeparatorChar}protocol{Path.DirectorySeparatorChar}",
            auth,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FindsACatalogueByWalkingUpFromANestedDirectory()
    {
        var root = Directory.CreateTempSubdirectory("mote-fixture-root").FullName;
        var nested = Path.Combine(root, "windows", "tests", "bin");
        try
        {
            WriteRootMarkers(root);
            Directory.CreateDirectory(nested);

            Assert.Equal(Path.GetFullPath(root), ProtocolFixtures.Find(nested, environmentRoot: null));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void EnvironmentRootOverridesTheWalk()
    {
        var root = Directory.CreateTempSubdirectory("mote-fixture-env").FullName;
        var elsewhere = Directory.CreateTempSubdirectory("mote-fixture-elsewhere").FullName;
        try
        {
            WriteRootMarkers(root);

            Assert.Equal(Path.GetFullPath(root), ProtocolFixtures.Find(elsewhere, root));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
            Directory.Delete(elsewhere, recursive: true);
        }
    }

    [Fact]
    public void CatalogueVersionAndLockActionMatchTheClient()
    {
        using var catalogue = JsonDocument.Parse(File.ReadAllText(Path.Combine(ProtocolFixtures.RepositoryRoot(), "protocol", "catalogue.json")));
        var root = catalogue.RootElement;

        Assert.Equal(1, root.GetProperty("version").GetInt32());
        Assert.Equal(ProtocolConstants.Version, root.GetProperty("version").GetInt32());
        Assert.Equal(ProtocolConstants.ActiveActions, ReadStrings(root.GetProperty("actions")));
        Assert.Equal(
            ProtocolConstants.DeviceWebSocketPath,
            root.GetProperty("paths").GetProperty("deviceWebSocket").GetString());
        Assert.Equal(
            ProtocolConstants.PairWebSocketPath,
            root.GetProperty("paths").GetProperty("pairWebSocket").GetString());
        Assert.Equal(CommandResultStatuses.All, ReadStrings(root.GetProperty("commandResultStatus")));
    }

    [Fact]
    public void SchemaAcceptsWindowsPlatform()
    {
        using var schema = JsonDocument.Parse(File.ReadAllText(Path.Combine(ProtocolFixtures.RepositoryRoot(), "protocol", "mote-v1.schema.json")));
        var platforms = schema.RootElement
            .GetProperty("$defs")
            .GetProperty("auth")
            .GetProperty("properties")
            .GetProperty("platform")
            .GetProperty("enum");

        Assert.Contains("windows", ReadStrings(platforms));
        Assert.Contains("macos", ReadStrings(platforms));
    }

    [Fact]
    public void WindowsAuthFixtureParsesAsWindowsLockProfile()
    {
        var auth = ParseFixture<AuthFrame>("auth-windows.json");

        Assert.Equal(ProtocolConstants.Version, auth.Version);
        Assert.Equal(ProtocolConstants.PlatformWindows, auth.Platform);
        Assert.Equal(ProtocolConstants.ActiveActions, auth.Actions);
        Assert.Equal("auth", auth.Type);

        var encoded = JsonNode.Parse(ProtocolCodec.Encode(auth))!.AsObject();
        Assert.Equal("windows", encoded["platform"]!.GetValue<string>());
        Assert.Equal(1, encoded["version"]!.GetValue<int>());
        Assert.Equal("lock", encoded["actions"]![0]!.GetValue<string>());
        Assert.Single(encoded["actions"]!.AsArray());
    }

    [Fact]
    public void Version1IsAcceptedAndVersion2IsRejected()
    {
        var auth = ParseFixture<AuthFrame>("auth-minimal.json");
        Assert.Equal(1, auth.Version);

        var rejected = ProtocolCodec.Parse(ReadFixture("invalid/auth-version.json"));
        Assert.False(rejected.IsSuccess);
        Assert.Equal(ProtocolParseFailure.UnsupportedVersion, rejected.Failure);
    }

    [Fact]
    public void LockIsAcceptedAndUnknownActionIsRejected()
    {
        var command = ParseFixture<CommandFrame>("command.json");
        Assert.Equal("lock", command.Action);

        var rejected = ProtocolCodec.Parse(ReadFixture("invalid/auth-unknown-action.json"));
        Assert.False(rejected.IsSuccess);
        Assert.Equal(ProtocolParseFailure.UnknownAction, rejected.Failure);
    }

    [Fact]
    public void ManifestFixturesDeserializeAndInvalidFixturesFail()
    {
        using var manifest = JsonDocument.Parse(File.ReadAllText(Path.Combine(ProtocolFixtures.FixturesDirectory(), "manifest.json")));
        foreach (var section in new[] { "incoming", "pairing", "pairingOutgoing", "outgoing" })
        {
            foreach (var item in manifest.RootElement.GetProperty(section).EnumerateArray())
            {
                var relative = item.GetString() ?? "";
                var parsed = ProtocolCodec.Parse(ReadFixture(relative));
                Assert.True(parsed.IsSuccess, relative);
                Assert.Equal(1, parsed.Frame!.Version);
                using var original = JsonDocument.Parse(ReadFixture(relative));
                Assert.Equal(original.RootElement.GetProperty("type").GetString(), parsed.Frame.Type);
            }
        }

        foreach (var item in manifest.RootElement.GetProperty("invalid").EnumerateArray())
        {
            var relative = item.GetString() ?? "";
            var parsed = ProtocolCodec.Parse(ReadFixture(relative));
            Assert.False(parsed.IsSuccess, relative);
        }
    }

    [Fact]
    public void UnknownFieldsAreIgnoredAndUnknownTypesDoNotThrow()
    {
        var node = JsonNode.Parse(ReadFixture("auth-windows.json"))!.AsObject();
        node["future_field"] = "ignored";
        var parsed = ProtocolCodec.Parse(node.ToJsonString());
        var auth = Assert.IsType<AuthFrame>(parsed.Frame);
        Assert.Equal("windows", auth.Platform);

        var unknown = ProtocolCodec.Parse("""{"type":"future_frame","version":1}""");
        Assert.False(unknown.IsSuccess);
        Assert.Equal(ProtocolParseFailure.UnknownType, unknown.Failure);
    }

    private static T ParseFixture<T>(string relative) where T : ProtocolFrame
    {
        var parsed = ProtocolCodec.Parse(ReadFixture(relative));
        return Assert.IsType<T>(parsed.Frame);
    }

    private static string ReadFixture(string relative) =>
        File.ReadAllText(Path.Combine(ProtocolFixtures.FixturesDirectory(), relative));

    private static string[] ReadStrings(JsonElement array) =>
        array.EnumerateArray().Select(item => item.GetString() ?? "").ToArray();

    private static void WriteRootMarkers(string root)
    {
        Directory.CreateDirectory(Path.Combine(root, "protocol", "fixtures"));
        File.WriteAllText(Path.Combine(root, "protocol", "catalogue.json"), "{}");
        File.WriteAllText(Path.Combine(root, "protocol", "fixtures", "manifest.json"), "{}");
        File.WriteAllText(Path.Combine(root, "protocol", "fixtures", "auth-windows.json"), "{}");
    }
}
