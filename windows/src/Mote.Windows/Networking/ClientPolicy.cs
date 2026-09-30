namespace Mote.Windows.Networking;

public static class ClientPolicy
{
    public static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(30);

    public static readonly TimeSpan AuthTimeout = TimeSpan.FromSeconds(10);

    public static readonly TimeSpan StableConnectionReset = TimeSpan.FromSeconds(10);

    public const string PairRequestsPath = "/v1/pair/requests";
}
