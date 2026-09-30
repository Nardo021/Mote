using Mote.Windows.Networking;
using Mote.Windows.Platform;
using AgentHost = Mote.Windows.AgentHost;

namespace Mote.Windows.Ui;

public interface ISettingsPresenter
{
    bool IsOpen { get; }

    void Show();

    void Hide();

    void AllowShutdown();
}

public sealed class DesktopSession
{
    private readonly AgentHost _host;
    private readonly ITraySurface _tray;
    private readonly AppInstance _instance;
    private readonly ISettingsPresenter _presenter;
    private int _quit;

    public DesktopSession(
        AgentHost host,
        SettingsViewModel model,
        ITraySurface tray,
        AppInstance instance,
        ISettingsPresenter presenter)
    {
        _host = host;
        Model = model;
        _tray = tray;
        _instance = instance;
        _presenter = presenter;
        _tray.OpenRequested += (_, _) => ShowSettings();
        _tray.ConnectRequested += (_, _) => _ = Run(Model.ConnectOrDisconnectAsync);
        _tray.DisconnectRequested += (_, _) => _ = Run(Model.ConnectOrDisconnectAsync);
        _tray.QuitRequested += (_, _) => _ = QuitAsync();
    }

    public SettingsViewModel Model { get; }

    public bool SettingsVisible { get; private set; }

    public bool HasQuit { get; private set; }

    public int SettingsActivations { get; private set; }

    public bool AcceptingInput { get; private set; } = true;

    public event Action? QuitCompleted;

    public void Start(bool showSettings)
    {
        Model.RefreshCredential();
        RefreshTray();
        if (showSettings)
        {
            ShowSettings();
        }
    }

    public void ShowSettings()
    {
        if (!AcceptingInput || HasQuit)
        {
            return;
        }

        SettingsActivations++;
        SettingsVisible = true;
        Model.LoadEditor();
        _presenter.Show();
        RefreshTray();
    }

    public void RequestCloseSettings()
    {
        if (HasQuit)
        {
            return;
        }

        SettingsVisible = false;
        _presenter.Hide();
        RefreshTray();
    }

    public void RefreshTray()
    {
        if (_tray.IsDisposed)
        {
            return;
        }

        Model.ProjectLiveState();
        _tray.Apply(TrayMenuModel.From(
            _host.Agent.Relay.Phase,
            _host.Agent.Relay.LastError,
            Model.WantsConnection,
            Model.HasCredential,
            busy: Model.IsBusy || !AcceptingInput));
    }

    public async Task QuitAsync()
    {
        if (Interlocked.Exchange(ref _quit, 1) != 0)
        {
            return;
        }

        AcceptingInput = false;
        HasQuit = true;
        _presenter.AllowShutdown();
        try
        {
            await _host.ShutdownAsync().ConfigureAwait(true);
        }
        finally
        {
            _tray.Dispose();
            _instance.Dispose();
            QuitCompleted?.Invoke();
        }
    }

    private async Task Run(Func<Task> action)
    {
        if (!AcceptingInput)
        {
            return;
        }

        try
        {
            await action().ConfigureAwait(true);
        }
        catch (Exception)
        {
            AgentLog.Info("UI action failed");
        }

        RefreshTray();
    }
}
