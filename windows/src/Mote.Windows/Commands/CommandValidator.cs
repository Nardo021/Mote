using Mote.Windows.Protocol;

namespace Mote.Windows.Commands;

public enum CommandRejection
{
    InvalidVersion,
    MissingCommandId,
    WrongDevice,
    UnknownAction,
    Expired,
    InvalidTimestamp,
    MissingNonce,
    Duplicate,
}

public abstract record CommandValidation
{
    private CommandValidation()
    {
    }

    public sealed record Accepted(string Action) : CommandValidation;

    public sealed record Rejected(CommandRejection Reason) : CommandValidation;
}

public sealed class CommandValidator
{
    public const long FutureSkewMilliseconds = 120_000;

    private readonly string _expectedDeviceId;
    private readonly Func<long> _now;
    private readonly long _futureSkewMilliseconds;

    public CommandValidator(string expectedDeviceId, Func<long>? now = null, long? futureSkewMilliseconds = null)
    {
        _expectedDeviceId = expectedDeviceId;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _futureSkewMilliseconds = futureSkewMilliseconds ?? FutureSkewMilliseconds;
    }

    public CommandValidation Validate(CommandFrame command, RecentCommandCache seen)
    {
        if (command.Version != ProtocolConstants.Version)
        {
            return new CommandValidation.Rejected(CommandRejection.InvalidVersion);
        }

        if (string.IsNullOrWhiteSpace(command.Id))
        {
            return new CommandValidation.Rejected(CommandRejection.MissingCommandId);
        }

        if (!string.Equals(command.DeviceId, _expectedDeviceId, StringComparison.Ordinal))
        {
            return new CommandValidation.Rejected(CommandRejection.WrongDevice);
        }

        if (string.IsNullOrWhiteSpace(command.Nonce))
        {
            return new CommandValidation.Rejected(CommandRejection.MissingNonce);
        }

        var now = _now();
        if (command.CreatedAt <= 0 || command.ExpiresAt <= 0 || command.CreatedAt > command.ExpiresAt)
        {
            return new CommandValidation.Rejected(CommandRejection.InvalidTimestamp);
        }

        if (command.CreatedAt > now + _futureSkewMilliseconds)
        {
            return new CommandValidation.Rejected(CommandRejection.InvalidTimestamp);
        }

        if (now > command.ExpiresAt)
        {
            return new CommandValidation.Rejected(CommandRejection.Expired);
        }

        if (!ProtocolConstants.IsActiveAction(command.Action))
        {
            return new CommandValidation.Rejected(CommandRejection.UnknownAction);
        }

        if (seen.Contains(command.Id))
        {
            return new CommandValidation.Rejected(CommandRejection.Duplicate);
        }

        return new CommandValidation.Accepted(command.Action);
    }

    public static string ToResultStatus(CommandRejection rejection) => rejection switch
    {
        CommandRejection.Expired => CommandResultStatuses.Expired,
        CommandRejection.UnknownAction => CommandResultStatuses.Unsupported,
        CommandRejection.InvalidVersion => CommandResultStatuses.Invalid,
        CommandRejection.MissingCommandId => CommandResultStatuses.Invalid,
        CommandRejection.WrongDevice => CommandResultStatuses.Invalid,
        CommandRejection.InvalidTimestamp => CommandResultStatuses.Invalid,
        CommandRejection.MissingNonce => CommandResultStatuses.Invalid,
        CommandRejection.Duplicate => CommandResultStatuses.Invalid,
        _ => throw new InvalidOperationException($"Unhandled command rejection {rejection}."),
    };
}
