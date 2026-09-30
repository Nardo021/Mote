using Mote.Windows.Actions;
using Mote.Windows.Commands;
using Mote.Windows.Protocol;

namespace Mote.Windows.Tests;

public class CommandValidationTests
{
    private const string DeviceId = "device-1";
    private const long Now = 1_000_000;

    [Fact]
    public void MatchingDeviceAndLockAreAccepted()
    {
        var result = Validator().Validate(Sample(), Cache());

        var accepted = Assert.IsType<CommandValidation.Accepted>(result);
        Assert.Equal("lock", accepted.Action);
    }

    [Fact]
    public void WrongDeviceIsRejected()
    {
        var command = Sample() with { DeviceId = "other-device" };

        var rejected = Assert.IsType<CommandValidation.Rejected>(Validator().Validate(command, Cache()));
        Assert.Equal(CommandRejection.WrongDevice, rejected.Reason);
    }

    [Fact]
    public void ExpiredCommandIsRejected()
    {
        var command = Sample() with
        {
            CreatedAt = Now - 20_000,
            ExpiresAt = Now - 1,
        };

        var rejected = Assert.IsType<CommandValidation.Rejected>(Validator().Validate(command, Cache()));
        Assert.Equal(CommandRejection.Expired, rejected.Reason);
    }

    [Fact]
    public void FutureInvalidCommandIsRejected()
    {
        var createdAt = Now + CommandValidator.FutureSkewMilliseconds + 1;
        var command = Sample() with
        {
            CreatedAt = createdAt,
            ExpiresAt = createdAt + 10_000,
        };

        var rejected = Assert.IsType<CommandValidation.Rejected>(Validator().Validate(command, Cache()));
        Assert.Equal(CommandRejection.InvalidTimestamp, rejected.Reason);
    }

    [Fact]
    public void UnknownActionIsRejected()
    {
        var command = Sample() with { Action = "sleep" };

        var rejected = Assert.IsType<CommandValidation.Rejected>(Validator().Validate(command, Cache()));
        Assert.Equal(CommandRejection.UnknownAction, rejected.Reason);
        Assert.Equal(CommandResultStatuses.Unsupported, CommandValidator.ToResultStatus(rejected.Reason));
    }

    [Fact]
    public void DuplicateCommandIdIsRejected()
    {
        var cache = Cache();
        var command = Sample();
        Assert.IsType<CommandValidation.Accepted>(Validator().Validate(command, cache));

        cache.Record(command.Id);

        var rejected = Assert.IsType<CommandValidation.Rejected>(Validator().Validate(command, cache));
        Assert.Equal(CommandRejection.Duplicate, rejected.Reason);
    }

    [Fact]
    public void RecentCommandCacheDropsTheOldestId()
    {
        var cache = new RecentCommandCache(limit: 3);
        for (var index = 0; index < 10; index++)
        {
            cache.Record($"id-{index}");
        }

        Assert.Equal(3, cache.Count);
        Assert.False(cache.Contains("id-0"));
        Assert.True(cache.Contains("id-9"));
    }

    [Fact]
    public void ProcessorExecutesLockOnceAndRejectsTheDuplicate()
    {
        var workstation = new FakeWorkstationLock();
        var processor = new CommandProcessor(DeviceId, new LockAction(workstation), () => Now);
        var command = Sample();

        var first = processor.Process(command);
        var second = processor.Process(command);

        Assert.Equal(CommandResultStatuses.Completed, first.Status);
        Assert.Equal(command.Id, first.CommandId);
        Assert.Equal(CommandResultStatuses.Invalid, second.Status);
        Assert.Equal(1, workstation.Calls);
    }

    [Fact]
    public void ProcessorMapsNativeFailureToFailed()
    {
        var workstation = new FakeWorkstationLock { Succeeds = false };
        var processor = new CommandProcessor(DeviceId, new LockAction(workstation), () => Now);

        var result = processor.Process(Sample());

        Assert.Equal(CommandResultStatuses.Failed, result.Status);
        Assert.Equal("execution_failed", result.Error);
        Assert.Equal(1, workstation.Calls);
    }

    private static CommandValidator Validator() => new(DeviceId, () => Now);

    private static RecentCommandCache Cache() => new();

    private static CommandFrame Sample() =>
        new()
        {
            Type = "command",
            Version = ProtocolConstants.Version,
            Id = "cmd-1",
            DeviceId = DeviceId,
            Action = "lock",
            CreatedAt = Now,
            ExpiresAt = Now + 10_000,
            Nonce = "nonce",
        };
}
