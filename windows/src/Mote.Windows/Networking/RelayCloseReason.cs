namespace Mote.Windows.Networking;

public static class RelayCloseReason
{
    public const string DeviceDisabled = "device_disabled";

    public const string CredentialRotated = "credential_rotated";

    public const string InvalidCredentials = "invalid_credentials";

    public const string UnsupportedVersion = "unsupported_version";

    public const string AuthTimeout = "auth_timeout";

    public const string HeartbeatStale = "heartbeat_stale";

    public const string Superseded = "superseded";

    public const string Expired = "expired";

    public const string ServerShutdown = "server_shutdown";

    public const string SocketError = "socket_error";

    public static bool StopsReconnect(string? reason) => reason switch
    {
        DeviceDisabled or CredentialRotated or InvalidCredentials or UnsupportedVersion => true,
        AuthTimeout or HeartbeatStale or Superseded or Expired or ServerShutdown or SocketError => false,
        _ => false,
    };
}
