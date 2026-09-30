namespace Mote.Windows.Networking;

public enum TransportFailure
{
    NotConnected,
    Closed,
}

public sealed class TransportException : Exception
{
    public TransportException(TransportFailure failure, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        Failure = failure;
    }

    public TransportFailure Failure { get; }
}

public interface IMessageTransport
{
    Task ConnectAsync(Uri uri, CancellationToken cancellationToken);

    Task SendAsync(ReadOnlyMemory<byte> payload, CancellationToken cancellationToken);

    Task<byte[]> ReceiveAsync(CancellationToken cancellationToken);

    Task CloseAsync(string? reason, CancellationToken cancellationToken);
}
