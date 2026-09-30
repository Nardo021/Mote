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
    private bool _disposed;

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
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        NetworkChange.NetworkAvailabilityChanged -= OnNetworkAvailabilityChanged;
    }

    private void OnNetworkAvailabilityChanged(object? sender, NetworkAvailabilityEventArgs args)
    {
        var availability = args.IsAvailable ? NetworkAvailability.Available : NetworkAvailability.Unavailable;
        if (availability == Availability)
        {
            return;
        }

        Availability = availability;
        AvailabilityChanged?.Invoke(this, Availability);
    }
}
