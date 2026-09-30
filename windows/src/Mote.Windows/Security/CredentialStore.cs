namespace Mote.Windows.Security;

public interface ICredentialStore
{
    string? Read();

    void Save(string credential);

    void Delete();
}

/// <summary>
/// Production credential boundary. W2 writes this target with Windows Credential Manager.
/// W1 refuses every call so a missing implementation cannot fall back to a file.
/// </summary>
public sealed class WindowsCredentialStore : ICredentialStore
{
    public const string TargetName = "com.nardo021.mote/device_connection";

    public string? Read() => throw new CredentialStoreDeferredException();

    public void Save(string credential) => throw new CredentialStoreDeferredException();

    public void Delete() => throw new CredentialStoreDeferredException();
}

public sealed class CredentialStoreDeferredException : InvalidOperationException
{
    public CredentialStoreDeferredException()
        : base("Windows Credential Manager storage is not available in W1. Disk storage is refused.")
    {
    }
}
