namespace Mote.Windows.Networking;

public enum ConnectionPhase
{
    NotConfigured,
    Disconnected,
    Connecting,
    Authenticating,
    Connected,
    Reconnecting,
    Error,
    Disabled,
}
