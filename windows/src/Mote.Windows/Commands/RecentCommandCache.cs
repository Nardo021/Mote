namespace Mote.Windows.Commands;

public sealed class RecentCommandCache
{
    private readonly object _gate = new();
    private readonly int _limit;
    private readonly Queue<string> _order = new();
    private readonly HashSet<string> _known = new(StringComparer.Ordinal);

    public RecentCommandCache(int limit = 256)
    {
        _limit = Math.Max(1, limit);
    }

    public int Count
    {
        get
        {
            lock (_gate)
            {
                return _order.Count;
            }
        }
    }

    public bool Contains(string id)
    {
        lock (_gate)
        {
            return _known.Contains(id);
        }
    }

    public void Record(string id)
    {
        lock (_gate)
        {
            if (!_known.Add(id))
            {
                return;
            }

            _order.Enqueue(id);
            while (_order.Count > _limit)
            {
                var removed = _order.Dequeue();
                _known.Remove(removed);
            }
        }
    }
}
