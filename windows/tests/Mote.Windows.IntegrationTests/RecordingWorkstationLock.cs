using Mote.Windows.Actions;

namespace Mote.Windows.IntegrationTests;

internal sealed class RecordingWorkstationLock : IWorkstationLock
{
    private int _calls;

    public int Calls => _calls;

    public long? LastRequestedUnixMilliseconds { get; private set; }

    public bool TryLock()
    {
        Interlocked.Increment(ref _calls);
        LastRequestedUnixMilliseconds = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return true;
    }
}
