using System.Runtime.InteropServices;

namespace Mote.Windows.Actions;

public interface IWorkstationLock
{
    bool TryLock();
}

public sealed class Win32WorkstationLock : IWorkstationLock
{
    public bool TryLock() => LockWorkStation();

    [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool LockWorkStation();
}

public enum LockOutcome
{
    Completed,
    Failed,
}

public sealed class LockAction
{
    private readonly IWorkstationLock _workstation;

    public LockAction(IWorkstationLock workstation)
    {
        _workstation = workstation;
    }

    public LockOutcome Execute() =>
        _workstation.TryLock() ? LockOutcome.Completed : LockOutcome.Failed;
}
