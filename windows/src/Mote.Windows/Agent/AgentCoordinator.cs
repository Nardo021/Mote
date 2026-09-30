using Mote.Windows.Actions;
using Mote.Windows.Commands;
using Mote.Windows.Protocol;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Agent;

public sealed class AgentCoordinator
{
    private readonly SettingsStore _settings;
    private readonly CommandProcessor _processor;

    public AgentCoordinator(SettingsStore settings, ICredentialStore credentials, IWorkstationLock workstationLock)
    {
        _settings = settings;
        Credentials = credentials;
        var loaded = settings.Load().Settings;
        _processor = new CommandProcessor(loaded.DeviceId, new LockAction(workstationLock));
    }

    public ICredentialStore Credentials { get; }

    public bool IsRunning { get; private set; }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (IsRunning)
        {
            return Task.CompletedTask;
        }

        _ = _settings.Load();
        IsRunning = true;
        return Task.CompletedTask;
    }

    public Task ShutdownAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IsRunning = false;
        return Task.CompletedTask;
    }

    public CommandResultFrame Process(CommandFrame command) => _processor.Process(command);
}
