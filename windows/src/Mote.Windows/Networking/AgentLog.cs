namespace Mote.Windows.Networking;

public static class AgentLog
{
    public static Action<string>? Sink { get; set; }

    public static void Info(string message)
    {
        Sink?.Invoke(message);
        System.Diagnostics.Debug.WriteLine(message);
    }
}
