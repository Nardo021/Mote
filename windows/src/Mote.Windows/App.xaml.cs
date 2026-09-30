using System.Windows;
using System.Windows.Threading;
using Mote.Windows.Actions;
using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Security;
using Mote.Windows.Storage;
using Mote.Windows.Ui;

namespace Mote.Windows;

public partial class App : Application
{
    private DesktopSession? _session;
    private DispatcherTimer? _statusTimer;

    private async void OnStartup(object sender, StartupEventArgs e)
    {
        var background = LaunchCommand.IsBackground(e.Args);
        var instance = AppInstance.Acquire(AppInstance.ProductionName, requestSettings: !background);
        if (!instance.IsPrimary)
        {
            instance.Dispose();
            Shutdown();
            return;
        }

        var settings = new SettingsStore();
        var host = new AgentHost(
            settings,
            new WindowsCredentialStore(),
            new Win32WorkstationLock(),
            network: new NetworkMonitor(),
            power: new PowerMonitor());
        try
        {
            await host.StartAsync().ConfigureAwait(true);
        }
        catch (Exception)
        {
            AgentLog.Info("Agent failed to start");
        }

        var launchAvailable = LaunchCommand.TryForCurrentProcess(out var command);
        IStartupService startup = launchAvailable
            ? PerUserStartupService.ForCurrentUser(command)
            : new DisabledStartupService();
        var model = new SettingsViewModel(host.Agent, settings, startup, launchAvailable, AppVersion.Current);
        var slot = new PresenterSlot();
        var session = new DesktopSession(host, model, new NotifyIconTray(), instance, slot);
        slot.Store(new SettingsWindowPresenter(model, session.RequestCloseSettings));
        _session = session;
        instance.ShowSettingsRequested += (_, _) => Dispatcher.BeginInvoke(session.ShowSettings);
        session.QuitCompleted += Shutdown;
        session.Start(showSettings: LaunchCommand.ShowsSettingsOnLaunch(instance.IsPrimary, background));
        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _statusTimer.Tick += (_, _) =>
        {
            if (_session is { HasQuit: false })
            {
                _session.RefreshTray();
            }
        };
        _statusTimer.Start();
    }

    private async void OnSessionEnding(object sender, SessionEndingCancelEventArgs e)
    {
        if (_session is not null)
        {
            await _session.QuitAsync().ConfigureAwait(true);
        }
    }

    private async void OnExit(object sender, ExitEventArgs e)
    {
        _statusTimer?.Stop();
        if (_session is { HasQuit: false })
        {
            await _session.QuitAsync().ConfigureAwait(true);
        }
    }

    private sealed class PresenterSlot : ISettingsPresenter
    {
        private ISettingsPresenter? _inner;

        public bool IsOpen => _inner?.IsOpen ?? false;

        public void Store(ISettingsPresenter presenter) => _inner = presenter;

        public void Show() => _inner?.Show();

        public void Hide() => _inner?.Hide();

        public void AllowShutdown() => _inner?.AllowShutdown();
    }
}
