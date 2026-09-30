using Mote.Windows.Actions;
using Mote.Windows.Protocol;

namespace Mote.Windows.Commands;

public sealed class CommandProcessor
{
    private readonly CommandValidator _validator;
    private readonly RecentCommandCache _cache;
    private readonly LockAction _lockAction;
    private readonly Func<long> _now;

    public CommandProcessor(
        string deviceId,
        LockAction lockAction,
        Func<long>? now = null,
        RecentCommandCache? cache = null)
    {
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _validator = new CommandValidator(deviceId, _now);
        _cache = cache ?? new RecentCommandCache();
        _lockAction = lockAction;
    }

    public CommandResultFrame Process(CommandFrame command)
    {
        switch (_validator.Validate(command, _cache))
        {
            case CommandValidation.Accepted:
                _cache.Record(command.Id);
                var outcome = _lockAction.Execute();
                return outcome switch
                {
                    LockOutcome.Completed => CommandResultFrame.Create(
                        command.Id,
                        CommandResultStatuses.Completed,
                        _now()),
                    LockOutcome.Failed => CommandResultFrame.Create(
                        command.Id,
                        CommandResultStatuses.Failed,
                        _now(),
                        "execution_failed"),
                    _ => throw new InvalidOperationException($"Unhandled lock outcome {outcome}."),
                };
            case CommandValidation.Rejected rejected:
                return CommandResultFrame.Create(
                    command.Id,
                    CommandValidator.ToResultStatus(rejected.Reason),
                    _now());
            default:
                throw new InvalidOperationException($"Unhandled command validation {command.Id}.");
        }
    }
}
