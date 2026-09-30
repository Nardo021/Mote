using System.Windows;

namespace Mote.Windows;

public partial class App : Application
{
    private AgentHost? _host;

    private async void OnStartup(object sender, StartupEventArgs e)
    {
        _host = new AgentHost();
        await _host.StartAsync().ConfigureAwait(true);

        var window = new MainWindow();
        MainWindow = window;
        window.Show();
    }

    private async void OnExit(object sender, ExitEventArgs e)
    {
        if (_host is not null)
        {
            await _host.ShutdownAsync().ConfigureAwait(true);
        }
    }
}
