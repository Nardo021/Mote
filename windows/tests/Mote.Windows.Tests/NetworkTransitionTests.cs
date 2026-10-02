using Mote.Windows.Platform;

namespace Mote.Windows.Tests;

public sealed class NetworkTransitionTests
{
    [Fact]
    public void SamePathDoesNotReconnect()
    {
        var path = new NetworkTransition.Observation(true, "wifi=10.0.0.8");

        Assert.Equal(NetworkTransition.Kind.None, NetworkTransition.Decide(path, path));
    }

    [Fact]
    public void LosingTheNetworkIsNotAPathRefresh()
    {
        var before = new NetworkTransition.Observation(true, "wifi=10.0.0.8");
        var after = new NetworkTransition.Observation(false, "");

        Assert.Equal(NetworkTransition.Kind.Lost, NetworkTransition.Decide(before, after));
        Assert.Equal(NetworkTransition.Kind.None, NetworkTransition.Decide(after, after));
    }

    [Fact]
    public void RestorationAndAddressChangeAreImmediate()
    {
        var down = new NetworkTransition.Observation(false, "");
        var wifi = new NetworkTransition.Observation(true, "wifi=10.0.0.8");
        var next = new NetworkTransition.Observation(true, "wifi=10.0.0.9");

        Assert.Equal(NetworkTransition.Kind.Restored, NetworkTransition.Decide(down, wifi));
        Assert.Equal(NetworkTransition.Kind.PathChanged, NetworkTransition.Decide(wifi, next));
    }
}
