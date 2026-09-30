namespace Mote.Windows.Platform;

public sealed class AppInstance : IDisposable
{
    public const string ProductionName = "Mote.Windows";

    private static readonly object Names = new();
    private static readonly HashSet<string> OwnedNames = new(StringComparer.Ordinal);

    private readonly string? _name;
    private readonly Mutex? _mutex;
    private readonly EventWaitHandle? _show;
    private readonly EventWaitHandle? _stop;
    private Thread? _listener;
    private bool _disposed;

    private AppInstance(bool isPrimary, string? name, Mutex? mutex, EventWaitHandle? show, EventWaitHandle? stop)
    {
        IsPrimary = isPrimary;
        _name = name;
        _mutex = mutex;
        _show = show;
        _stop = stop;
    }

    public bool IsPrimary { get; }

    public event EventHandler? ShowSettingsRequested;

    public static AppInstance Acquire(string name, bool requestSettings)
    {
        if (name.Length == 0
            || name.Length > 80
            || name.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not ('.' or '-')))
        {
            throw new ArgumentException("Instance name is invalid.", nameof(name));
        }

        var showName = @"Local\" + name + ".show";
        lock (Names)
        {
            if (!OwnedNames.Add(name))
            {
                if (requestSettings)
                {
                    Signal(showName);
                }

                return new AppInstance(false, null, null, null, null);
            }
        }

        var mutex = new Mutex(false, @"Local\" + name + ".lock");
        bool owned;
        try
        {
            owned = mutex.WaitOne(0);
        }
        catch (AbandonedMutexException)
        {
            owned = true;
        }

        if (!owned)
        {
            lock (Names)
            {
                OwnedNames.Remove(name);
            }

            mutex.Dispose();
            if (requestSettings)
            {
                Signal(showName);
            }

            return new AppInstance(false, null, null, null, null);
        }

        var show = new EventWaitHandle(false, EventResetMode.ManualReset, showName);
        var stop = new EventWaitHandle(false, EventResetMode.ManualReset);
        var instance = new AppInstance(true, name, mutex, show, stop);
        instance._listener = new Thread(instance.Listen)
        {
            IsBackground = true,
            Name = "Mote.Instance",
        };
        instance._listener.Start();
        return instance;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (!IsPrimary)
        {
            return;
        }

        _stop!.Set();
        _listener?.Join(TimeSpan.FromSeconds(2));
        _show!.Dispose();
        _stop.Dispose();
        try
        {
            _mutex!.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // The mutex was already released.
        }

        _mutex!.Dispose();
        if (_name is not null)
        {
            lock (Names)
            {
                OwnedNames.Remove(_name);
            }
        }
    }

    private void Listen()
    {
        var handles = new WaitHandle[] { _show!, _stop! };
        while (true)
        {
            int signaled;
            try
            {
                signaled = WaitHandle.WaitAny(handles);
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            if (signaled != 0)
            {
                return;
            }

            try
            {
                _show!.Reset();
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            try
            {
                ShowSettingsRequested?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception)
            {
                // The UI callback reports its own failure. Keep listening.
            }
        }
    }

    private static void Signal(string showName)
    {
        for (var attempt = 0; attempt < 20; attempt++)
        {
            try
            {
                using var show = EventWaitHandle.OpenExisting(showName);
                show.Set();
                return;
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                Thread.Sleep(15);
            }
        }
    }
}
