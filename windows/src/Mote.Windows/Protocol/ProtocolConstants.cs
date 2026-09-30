namespace Mote.Windows.Protocol;

/// <summary>
/// Wire constants. Canonical values live in <c>protocol/catalogue.json</c>.
/// </summary>
public static class ProtocolConstants
{
    public const int Version = 1;

    public const string PlatformMacos = "macos";

    public const string PlatformWindows = "windows";

    public const string ActionLock = "lock";

    public const string DeviceWebSocketPath = "/v1/ws/device";

    public const string PairWebSocketPath = "/v1/ws/pair";

    public static readonly string[] ActiveActions = [ActionLock];

    public static bool IsKnownPlatform(string platform) =>
        platform is PlatformMacos or PlatformWindows;

    public static bool IsActiveAction(string action) =>
        action == ActionLock;
}
