using Microsoft.Win32;

namespace Mote.Windows.Platform;

public enum PowerTransition
{
    Suspend,
    Resume,
}

public interface IPowerMonitor : IDisposable
{
    event EventHandler<PowerTransition>? Transitioned;
}

public sealed class PowerMonitor : IPowerMonitor
{
    public PowerMonitor()
    {
        SystemEvents.PowerModeChanged += OnPowerModeChanged;
    }

    public event EventHandler<PowerTransition>? Transitioned;

    public void Dispose()
    {
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;
    }

    private void OnPowerModeChanged(object? sender, PowerModeChangedEventArgs args)
    {
        switch (args.Mode)
        {
            case PowerModes.Suspend:
                Transitioned?.Invoke(this, PowerTransition.Suspend);
                break;
            case PowerModes.Resume:
                Transitioned?.Invoke(this, PowerTransition.Resume);
                break;
            case PowerModes.StatusChange:
                break;
            default:
                _ = args.Mode;
                break;
        }
    }
}
