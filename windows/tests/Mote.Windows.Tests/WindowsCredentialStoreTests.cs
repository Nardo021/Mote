using System.Text;
using Mote.Windows.Security;

namespace Mote.Windows.Tests;

public sealed class WindowsCredentialStoreTests : IDisposable
{
    private readonly string _target = "com.nardo021.mote.test/" + Guid.NewGuid().ToString("D");
    private readonly WindowsCredentialStore _store;

    public WindowsCredentialStoreTests()
    {
        _store = new WindowsCredentialStore(_target);
    }

    [Fact]
    public void MissingCredentialReadsNull()
    {
        Assert.Null(_store.Read());
        Assert.NotEqual(WindowsCredentialStore.TargetName, _store.ActiveTargetName);
        Assert.StartsWith("com.nardo021.mote.test/", _store.ActiveTargetName, StringComparison.Ordinal);
    }

    [Fact]
    public void WriteThenReadRoundTrips()
    {
        const string secret = "mote-device-credential";
        try
        {
            _store.Save(secret);
            SecretAssert.Equal(secret, _store.Read());
        }
        finally
        {
            _store.Delete();
        }
    }

    [Fact]
    public void OverwriteReplacesTheStoredCredential()
    {
        const string first = "mote-first";
        const string second = "mote-second";
        try
        {
            _store.Save(first);
            _store.Save(second);
            SecretAssert.Equal(second, _store.Read());
        }
        finally
        {
            _store.Delete();
        }
    }

    [Fact]
    public void DeleteRemovesTheCredentialAndMissingDeleteIsSafe()
    {
        _store.Save("mote-delete");
        _store.Delete();
        Assert.Null(_store.Read());
        _store.Delete();
        Assert.Null(_store.Read());
    }

    [Fact]
    public void UnicodeCredentialRoundTrips()
    {
        const string secret = "mote-密钥-α";
        try
        {
            _store.Save(secret);
            SecretAssert.Equal(secret, _store.Read());
        }
        finally
        {
            _store.Delete();
        }
    }

    [Fact]
    public void OversizedCredentialIsRejectedBeforeNativeWrite()
    {
        var secret = new string('a', WindowsCredentialStore.MaximumBlobBytes + 1);
        var error = Assert.Throws<CredentialStoreException>(() => _store.Save(secret));
        Assert.Null(error.NativeError);
        Assert.DoesNotContain(secret, error.Message, StringComparison.Ordinal);
        Assert.Null(_store.Read());
    }

    [Fact]
    public void FailedNativeWriteMapsToAnExceptionWithoutTheSecret()
    {
        var secret = "native-fail-" + Guid.NewGuid().ToString("N");
        var store = new WindowsCredentialStore(new string('n', 40_000));
        try
        {
            var error = Assert.Throws<CredentialStoreException>(() => store.Save(secret));
            Assert.Contains("Credential Manager", error.Message, StringComparison.Ordinal);
            Assert.DoesNotContain(secret, error.Message, StringComparison.Ordinal);
            Assert.DoesNotContain(secret, error.ToString(), StringComparison.Ordinal);
        }
        finally
        {
            try
            {
                store.Delete();
            }
            catch (CredentialStoreException)
            {
                // The rejected target was not stored.
            }
        }
    }

    public void Dispose()
    {
        try
        {
            _store.Delete();
        }
        catch (CredentialStoreException)
        {
            // The isolated target is already gone.
        }
    }
}
