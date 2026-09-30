using Mote.Windows.Networking;

namespace Mote.Windows.Ui;

public sealed record TrayMenuModel(
    string StatusText,
    string Tooltip,
    string ToggleText,
    bool OffersDisconnect,
    bool ToggleEnabled)
{
    public static TrayMenuModel Initial { get; } = From(
        ConnectionPhase.NotConfigured,
        null,
        wantsConnection: false,
        hasCredential: false,
        busy: false);

    public static TrayMenuModel From(
        ConnectionPhase phase,
        string? lastError,
        bool wantsConnection,
        bool hasCredential,
        bool busy)
    {
        var label = StatusCopy.TrayLabel(phase, lastError);
        var disconnect = StatusCopy.OffersDisconnect(wantsConnection, phase, hasCredential);
        return new TrayMenuModel(
            "Mote — " + label,
            "Mote — " + label,
            disconnect ? "Disconnect" : "Connect",
            disconnect,
            ToggleEnabled: !busy);
    }
}

public interface ITraySurface : IDisposable
{
    bool IsDisposed { get; }

    event EventHandler? OpenRequested;

    event EventHandler? ConnectRequested;

    event EventHandler? DisconnectRequested;

    event EventHandler? QuitRequested;

    void Apply(TrayMenuModel model);
}
