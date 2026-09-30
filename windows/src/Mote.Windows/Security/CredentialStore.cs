using System.Runtime.InteropServices;
using System.Text;

namespace Mote.Windows.Security;

public interface ICredentialStore
{
    string? Read();

    void Save(string credential);

    void Delete();
}

public sealed class WindowsCredentialStore : ICredentialStore
{
    public const string TargetName = "com.nardo021.mote/device_connection";

    public const int MaximumBlobBytes = 2048;

    private readonly string _targetName;

    public WindowsCredentialStore(string? targetName = null)
    {
        if (string.IsNullOrWhiteSpace(targetName))
        {
            _targetName = TargetName;
        }
        else
        {
            _targetName = targetName.Trim();
        }
    }

    public string ActiveTargetName => _targetName;

    public string? Read()
    {
        if (!NativeCredential.CredRead(_targetName, NativeCredential.Generic, 0, out var pointer))
        {
            var error = Marshal.GetLastWin32Error();
            if (error == NativeCredential.NotFound)
            {
                return null;
            }

            throw new CredentialStoreException("Credential Manager could not read the device credential.", error);
        }

        try
        {
            var native = Marshal.PtrToStructure<NativeCredential.Credential>(pointer);
            if (native.CredentialBlob == IntPtr.Zero || native.CredentialBlobSize <= 0 || native.CredentialBlobSize > MaximumBlobBytes)
            {
                throw new CredentialStoreException("Credential Manager returned an unreadable device credential.");
            }

            var bytes = new byte[native.CredentialBlobSize];
            try
            {
                Marshal.Copy(native.CredentialBlob, bytes, 0, bytes.Length);
                for (var index = 0; index < bytes.Length; index++)
                {
                    Marshal.WriteByte(native.CredentialBlob, index, 0);
                }

                try
                {
                    var secret = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true).GetString(bytes);
                    if (secret.Length == 0 || secret.Contains('\0'))
                    {
                        throw new CredentialStoreException("Credential Manager returned an unreadable device credential.");
                    }

                    return secret;
                }
                catch (ArgumentException)
                {
                    throw new CredentialStoreException("Credential Manager returned an unreadable device credential.");
                }
            }
            finally
            {
                Array.Clear(bytes);
            }
        }
        finally
        {
            NativeCredential.CredFree(pointer);
        }
    }

    public void Save(string credential)
    {
        ArgumentNullException.ThrowIfNull(credential);
        if (credential.Length == 0 || credential.Contains('\0'))
        {
            throw new CredentialStoreException("The device credential cannot be stored.");
        }

        var bytes = Encoding.UTF8.GetBytes(credential);
        if (bytes.Length == 0 || bytes.Length > MaximumBlobBytes)
        {
            Array.Clear(bytes);
            throw new CredentialStoreException("The device credential cannot be stored.");
        }

        var buffer = Marshal.AllocHGlobal(bytes.Length);
        try
        {
            Marshal.Copy(bytes, 0, buffer, bytes.Length);
            var native = new NativeCredential.Credential
            {
                Type = NativeCredential.Generic,
                TargetName = _targetName,
                Comment = "Mote",
                CredentialBlobSize = bytes.Length,
                CredentialBlob = buffer,
                Persist = NativeCredential.PersistLocalMachine,
                UserName = "Mote",
            };
            bool written;
            var error = 0;
            try
            {
                written = NativeCredential.CredWrite(ref native, 0);
                if (!written)
                {
                    error = Marshal.GetLastWin32Error();
                }
            }
            catch (Exception)
            {
                throw new CredentialStoreException("Credential Manager rejected the device credential.");
            }

            if (!written)
            {
                throw new CredentialStoreException("Credential Manager rejected the device credential.", error);
            }
        }
        finally
        {
            for (var index = 0; index < bytes.Length; index++)
            {
                Marshal.WriteByte(buffer, index, 0);
            }

            Marshal.FreeHGlobal(buffer);
            Array.Clear(bytes);
        }
    }

    public void Delete()
    {
        if (NativeCredential.CredDelete(_targetName, NativeCredential.Generic, 0))
        {
            return;
        }

        var error = Marshal.GetLastWin32Error();
        if (error == NativeCredential.NotFound)
        {
            return;
        }

        throw new CredentialStoreException("Credential Manager could not delete the device credential.", error);
    }

    private static class NativeCredential
    {
        public const int Generic = 1;

        public const int PersistLocalMachine = 2;

        public const int NotFound = 1168;

        [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredWrite(ref Credential credential, int flags);

        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredRead(string targetName, int type, int flags, out IntPtr credential);

        [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredDelete(string targetName, int type, int flags);

        [DllImport("advapi32.dll", EntryPoint = "CredFree")]
        public static extern void CredFree(IntPtr buffer);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct Credential
        {
            public int Flags;
            public int Type;
            public string? TargetName;
            public string? Comment;
            public long LastWritten;
            public int CredentialBlobSize;
            public IntPtr CredentialBlob;
            public int Persist;
            public int AttributeCount;
            public IntPtr Attributes;
            public string? TargetAlias;
            public string? UserName;
        }
    }
}

public sealed class CredentialStoreException : InvalidOperationException
{
    public CredentialStoreException(string message, int? nativeError = null)
        : base(nativeError is null ? message : $"{message} Win32 {nativeError.Value}.")
    {
        NativeError = nativeError;
    }

    public int? NativeError { get; }
}
