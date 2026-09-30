using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows;

public sealed class AgentHost
{
    public AgentHost()
        : this(new SettingsStore(), new WindowsCredentialStore(), new Win32WorkstationLock(), null, null)
    {
    }

    public AgentHost(
        SettingsStore settings,
        ICredentialStore credentials,
        IWorkstationLock workstationLock,
        Func<IMessageTransport>? transportFactory = null,
        IPairingApi? pairingApi = null)
    {
        Agent = new AgentCoordinator(settings, credentials, workstationLock, transportFactory, pairingApi);
    }

    public AgentCoordinator Agent { get; }

    public Task StartAsync(CancellationToken cancellationToken = default) =>
        Agent.StartAsync(cancellationToken);

    public Task ShutdownAsync(CancellationToken cancellationToken = default) =>
        Agent.ShutdownAsync(cancellationToken);
}
