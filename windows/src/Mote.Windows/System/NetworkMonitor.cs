using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Mote.Windows.Platform;

public enum NetworkAvailability
{
    Available,
    Unavailable,
}

public interface INetworkMonitor : IDisposable
{
    NetworkAvailability Availability { get; }

    event EventHandler<NetworkAvailability>? AvailabilityChanged;

    event EventHandler? PathChanged;
}

public sealed class NetworkMonitor : INetworkMonitor
{
    private readonly object _gate = new();
    private bool _disposed;
    private string _signature;

    public NetworkMonitor()
    {
        var observed = NetworkTransition.Observe();
        Availability = observed.Available
            ? NetworkAvailability.Available
            : NetworkAvailability.Unavailable;
        _signature = observed.Signature;
        NetworkChange.NetworkAvailabilityChanged += OnNetworkChanged;
        NetworkChange.NetworkAddressChanged += OnNetworkChanged;
    }

    public NetworkAvailability Availability { get; private set; }

    public event EventHandler<NetworkAvailability>? AvailabilityChanged;

    public event EventHandler? PathChanged;

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        NetworkChange.NetworkAvailabilityChanged -= OnNetworkChanged;
        NetworkChange.NetworkAddressChanged -= OnNetworkChanged;
    }

    private void OnNetworkChanged(object? sender, EventArgs args)
    {
        NetworkTransition.Kind kind;
        NetworkAvailability availability;
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            var next = NetworkTransition.Observe();
            var previous = new NetworkTransition.Observation(Availability == NetworkAvailability.Available, _signature);
            kind = NetworkTransition.Decide(previous, next);
            if (kind == NetworkTransition.Kind.None)
            {
                return;
            }

            Availability = next.Available
                ? NetworkAvailability.Available
                : NetworkAvailability.Unavailable;
            _signature = next.Signature;
            availability = Availability;
        }

        switch (kind)
        {
            case NetworkTransition.Kind.Lost:
            case NetworkTransition.Kind.Restored:
                AvailabilityChanged?.Invoke(this, availability);
                break;
            case NetworkTransition.Kind.PathChanged:
                PathChanged?.Invoke(this, EventArgs.Empty);
                break;
            case NetworkTransition.Kind.None:
                break;
            default:
                throw new InvalidOperationException($"Unhandled network transition {kind}.");
        }
    }
}

internal static class NetworkTransition
{
    internal readonly record struct Observation(bool Available, string Signature);

    internal enum Kind
    {
        None,
        Lost,
        Restored,
        PathChanged,
    }

    internal static Kind Decide(Observation previous, Observation next)
    {
        if (!next.Available)
        {
            return previous.Available ? Kind.Lost : Kind.None;
        }

        if (!previous.Available)
        {
            return Kind.Restored;
        }

        return string.Equals(previous.Signature, next.Signature, StringComparison.Ordinal)
            ? Kind.None
            : Kind.PathChanged;
    }

    internal static Observation Observe()
    {
        var available = false;
        try
        {
            available = NetworkInterface.GetIsNetworkAvailable();
        }
        catch (NetworkInformationException)
        {
            return new Observation(false, "");
        }

        var parts = new List<string>();
        NetworkInterface[] interfaces;
        try
        {
            interfaces = NetworkInterface.GetAllNetworkInterfaces();
        }
        catch (NetworkInformationException)
        {
            return new Observation(available, "");
        }

        foreach (var nic in interfaces)
        {
            if (nic.OperationalStatus != OperationalStatus.Up
                || nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
            {
                continue;
            }

            try
            {
                var addresses = nic.GetIPProperties().UnicastAddresses
                    .Select(address => address.Address)
                    .Where(address => address.AddressFamily == AddressFamily.InterNetwork)
                    .Select(address => address.ToString())
                    .OrderBy(address => address, StringComparer.Ordinal);
                parts.Add(nic.Id + "=" + string.Join(',', addresses));
            }
            catch (NetworkInformationException)
            {
                parts.Add(nic.Id);
            }
        }

        parts.Sort(StringComparer.Ordinal);
        return new Observation(available, string.Join('|', parts));
    }
}
