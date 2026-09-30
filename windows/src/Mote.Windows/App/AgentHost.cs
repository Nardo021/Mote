using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Networking;
using Mote.Windows.Platform;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows;

public sealed class AgentHost
{
    public AgentHost()
        : this(
            new SettingsStore(),
            new WindowsCredentialStore(),
            new Win32WorkstationLock(),
            transportFactory: null,
            pairingApi: null,
            network: new NetworkMonitor(),
            power: new PowerMonitor())
    {
    }

    public AgentHost(
        SettingsStore settings,
        ICredentialStore credentials,
        IWorkstationLock workstationLock,
        Func<IMessageTransport>? transportFactory = null,
        IPairingApi? pairingApi = null,
        INetworkMonitor? network = null,
        IPowerMonitor? power = null)
    {
        Agent = new AgentCoordinator(
            settings,
            credentials,
            workstationLock,
            transportFactory,
            pairingApi,
            network: network,
            power: power);
    }

    public AgentCoordinator Agent { get; }

    public Task StartAsync(CancellationToken cancellationToken = default) =>
        Agent.StartAsync(cancellationToken);

    public Task ShutdownAsync(CancellationToken cancellationToken = default) =>
        Agent.ShutdownAsync(cancellationToken);
}
