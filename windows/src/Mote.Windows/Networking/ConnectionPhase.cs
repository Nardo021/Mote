namespace Mote.Windows.Networking;

public enum ConnectionPhase
{
    NotConfigured,
    Disconnected,
    NetworkUnavailable,
    Connecting,
    Authenticating,
    Connected,
    Reconnecting,
    Error,
    Disabled,
}
