using Mote.Windows.Ui;

namespace Mote.Windows;

public sealed class SettingsWindowPresenter : ISettingsPresenter
{
    private readonly SettingsViewModel _model;
    private readonly Action _hideRequested;
    private SettingsWindow? _window;

    public SettingsWindowPresenter(SettingsViewModel model, Action hideRequested)
    {
        _model = model;
        _hideRequested = hideRequested;
    }

    public bool IsOpen => _window is { IsVisible: true };

    public void Show()
    {
        _window ??= new SettingsWindow(_model, _hideRequested);
        _window.SyncFromModel();
        _window.Show();
        if (_window.WindowState == System.Windows.WindowState.Minimized)
        {
            _window.WindowState = System.Windows.WindowState.Normal;
        }

        _window.Activate();
    }

    public void Hide()
    {
        if (_window is null)
        {
            return;
        }

        _window.ClearCredentialInput();
        _window.Hide();
    }

    public void AllowShutdown() => _window?.AllowClose();
}
