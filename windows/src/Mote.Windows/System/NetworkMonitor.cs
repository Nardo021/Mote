using System.Net.NetworkInformation;

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
}

public sealed class NetworkMonitor : INetworkMonitor
{
    public NetworkMonitor()
    {
        Availability = NetworkInterface.GetIsNetworkAvailable()
            ? NetworkAvailability.Available
            : NetworkAvailability.Unavailable;
        NetworkChange.NetworkAvailabilityChanged += OnNetworkAvailabilityChanged;
    }

    public NetworkAvailability Availability { get; private set; }

    public event EventHandler<NetworkAvailability>? AvailabilityChanged;

    public void Dispose()
    {
        NetworkChange.NetworkAvailabilityChanged -= OnNetworkAvailabilityChanged;
    }

    private void OnNetworkAvailabilityChanged(object? sender, NetworkAvailabilityEventArgs args)
    {
        Availability = args.IsAvailable ? NetworkAvailability.Available : NetworkAvailability.Unavailable;
        AvailabilityChanged?.Invoke(this, Availability);
    }
}
