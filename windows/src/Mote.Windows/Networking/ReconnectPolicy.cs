namespace Mote.Windows.Networking;

public sealed class ReconnectPolicy
{
    public static readonly TimeSpan Cap = TimeSpan.FromSeconds(30);

    public static readonly TimeSpan Minimum = TimeSpan.FromMilliseconds(100);

    public const double JitterFraction = 0.2;

    private static readonly TimeSpan[] Delays =
    [
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(4),
        TimeSpan.FromSeconds(8),
        TimeSpan.FromSeconds(15),
        TimeSpan.FromSeconds(30),
    ];

    private readonly Func<double> _randomUnitInterval;

    public ReconnectPolicy(Func<double>? randomUnitInterval = null)
    {
        _randomUnitInterval = randomUnitInterval ?? (() => (Random.Shared.NextDouble() * 2) - 1);
    }

    public TimeSpan BaseDelay(int attempt)
    {
        var index = Math.Clamp(attempt, 0, Delays.Length - 1);
        return Delays[index];
    }

    public TimeSpan Delay(int attempt)
    {
        var baseDelay = BaseDelay(attempt);
        var jitter = TimeSpan.FromTicks((long)(baseDelay.Ticks * JitterFraction * _randomUnitInterval()));
        var delayed = baseDelay + jitter;
        if (delayed < Minimum)
        {
            return Minimum;
        }

        return delayed > Cap ? Cap : delayed;
    }
}
