using System.Net;
using System.Net.Sockets;

namespace Mote.Windows.IntegrationTests;

internal static class LoopbackGuard
{
    public static void Require(Uri uri)
    {
        if (!uri.IsAbsoluteUri || !uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Integration relay URL must be an absolute http loopback URL.");
        }

        if (!IPAddress.TryParse(uri.Host, out var address) || !IPAddress.IsLoopback(address) || address.AddressFamily != AddressFamily.InterNetwork)
        {
            throw new InvalidOperationException("Integration relay host must be an IPv4 loopback address.");
        }

        if (uri.Port is <= 0 or > 65535)
        {
            throw new InvalidOperationException("Integration relay port is invalid.");
        }
    }
}
