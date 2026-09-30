using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows;

public sealed class AgentHost
{
    public AgentHost()
        : this(new SettingsStore(), new WindowsCredentialStore(), new Win32WorkstationLock())
    {
    }

    public AgentHost(SettingsStore settings, ICredentialStore credentials, IWorkstationLock workstationLock)
    {
        Agent = new AgentCoordinator(settings, credentials, workstationLock);
    }

    public AgentCoordinator Agent { get; }

    public Task StartAsync(CancellationToken cancellationToken = default) =>
        Agent.StartAsync(cancellationToken);

    public Task ShutdownAsync(CancellationToken cancellationToken = default) =>
        Agent.ShutdownAsync(cancellationToken);
}
