using System.Windows;
using Mote.Windows.Ui;

namespace Mote.Windows;

public partial class SettingsWindow : Window
{
    private readonly SettingsViewModel _model;
    private readonly Action _hideRequested;
    private bool _allowClose;
    private bool _suppressLaunch;

    public SettingsWindow(SettingsViewModel model, Action hideRequested)
    {
        _model = model;
        _hideRequested = hideRequested;
        InitializeComponent();
        DataContext = model;
        Closing += OnClosing;
    }

    public void SyncFromModel()
    {
        _suppressLaunch = true;
        LaunchBox.IsChecked = _model.LaunchAtLogin;
        LaunchBox.IsEnabled = _model.LaunchAtLoginAvailable && !_model.IsBusy;
        _suppressLaunch = false;
    }

    public void ClearCredentialInput() => CredentialBox.Clear();

    public void AllowClose() => _allowClose = true;

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_allowClose)
        {
            return;
        }

        e.Cancel = true;
        ClearCredentialInput();
        Hide();
        _hideRequested();
    }

    private async void OnSaveUrl(object sender, RoutedEventArgs e)
    {
        await _model.SaveRelayUrlAsync();
    }

    private async void OnConnect(object sender, RoutedEventArgs e)
    {
        await _model.ConnectOrDisconnectAsync();
    }

    private async void OnPair(object sender, RoutedEventArgs e)
    {
        await _model.PairAsync();
    }

    private async void OnCancelPairing(object sender, RoutedEventArgs e)
    {
        await _model.CancelPairingAsync();
    }

    private async void OnSaveCredential(object sender, RoutedEventArgs e)
    {
        var replacement = CredentialBox.Password;
        CredentialBox.Clear();
        await _model.ReplaceCredentialAsync(replacement);
    }

    private void OnCopyDeviceId(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(_model.DeviceId);
            _model.SetNotice("Device ID copied.");
        }
        catch (Exception)
        {
            _model.SetNotice("The device ID could not be copied.");
        }
    }

    private async void OnLaunchChanged(object sender, RoutedEventArgs e)
    {
        if (_suppressLaunch)
        {
            return;
        }

        await _model.SetLaunchAtLoginAsync(LaunchBox.IsChecked == true);
        SyncFromModel();
    }
}
