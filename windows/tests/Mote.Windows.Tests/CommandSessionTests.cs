using Mote.Windows.Protocol;

namespace Mote.Windows.Tests;

public sealed class CommandSessionTests
{
    [Fact]
    public async Task ValidLockSendsCompletedOnce()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().Enqueue(TestFrames.Command("cmd-1", SessionHarness.DeviceId, "lock", SessionHarness.Now));
        var result = await WaitForResultAsync(harness);

        Assert.Equal(1, harness.Workstation.Calls);
        Assert.Equal("cmd-1", result.CommandId);
        Assert.Equal(CommandResultStatuses.Completed, result.Status);
        Assert.Null(result.Error);
        Assert.Equal(ProtocolConstants.Version, result.Version);
    }

    [Fact]
    public async Task NativeLockFailureSendsFailed()
    {
        using var harness = new SessionHarness(lockSucceeds: false);
        await harness.AuthenticateAsync();
        harness.Current().Enqueue(TestFrames.Command("cmd-fail", SessionHarness.DeviceId, "lock", SessionHarness.Now));
        var result = await WaitForResultAsync(harness);

        Assert.Equal(1, harness.Workstation.Calls);
        Assert.Equal("cmd-fail", result.CommandId);
        Assert.Equal(CommandResultStatuses.Failed, result.Status);
        Assert.Equal("execution_failed", result.Error);
    }

    [Fact]
    public async Task ExpiredCommandDoesNotLock()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().Enqueue(TestFrames.Command(
            "cmd-old",
            SessionHarness.DeviceId,
            "lock",
            SessionHarness.Now,
            createdAt: SessionHarness.Now - 5_000,
            expiresAt: SessionHarness.Now - 1));
        var result = await WaitForResultAsync(harness);

        Assert.Equal(0, harness.Workstation.Calls);
        Assert.Equal(CommandResultStatuses.Expired, result.Status);
        Assert.Equal("cmd-old", result.CommandId);
    }

    [Fact]
    public async Task WrongDeviceDoesNotLock()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().Enqueue(TestFrames.Command(
            "cmd-other",
            "99999999-9999-4999-8999-999999999999",
            "lock",
            SessionHarness.Now));
        var result = await WaitForResultAsync(harness);

        Assert.Equal(0, harness.Workstation.Calls);
        Assert.Equal(CommandResultStatuses.Invalid, result.Status);
        Assert.Equal("cmd-other", result.CommandId);
    }

    [Fact]
    public async Task UnsupportedActionDoesNotLock()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().Enqueue(TestFrames.Command("cmd-sleep", SessionHarness.DeviceId, "sleep", SessionHarness.Now));
        var result = await WaitForResultAsync(harness);

        Assert.Equal(0, harness.Workstation.Calls);
        Assert.Equal(CommandResultStatuses.Unsupported, result.Status);
        Assert.Equal("cmd-sleep", result.CommandId);
    }

    [Fact]
    public async Task DuplicateCommandDoesNotLockTwice()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var command = TestFrames.Command("cmd-dup", SessionHarness.DeviceId, "lock", SessionHarness.Now);
        harness.Current().Enqueue(command);
        harness.Current().Enqueue(command);
        await TestWait.Until(() => Results(harness).Length == 2);
        var results = Results(harness);

        Assert.Equal(1, harness.Workstation.Calls);
        Assert.Equal(CommandResultStatuses.Completed, results[0].Status);
        Assert.Equal(CommandResultStatuses.Invalid, results[1].Status);
        Assert.All(results, result => Assert.Equal("cmd-dup", result.CommandId));
    }

    [Fact]
    public async Task MalformedCommandDoesNotExecute()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        harness.Current().Enqueue("{");
        harness.Current().Enqueue(TestFrames.Command("cmd-ok", SessionHarness.DeviceId, "lock", SessionHarness.Now));
        var result = await WaitForResultAsync(harness);

        Assert.Equal(1, harness.Workstation.Calls);
        Assert.Equal("cmd-ok", result.CommandId);
        Assert.Equal(CommandResultStatuses.Completed, result.Status);
    }

    [Fact]
    public async Task StaleSessionCommandCannotAffectTheNewGeneration()
    {
        using var harness = new SessionHarness();
        await harness.AuthenticateAsync();
        var stale = harness.Client.Generation;
        harness.Current().CloseFromRemote("socket_error");
        Assert.True(await harness.Delay.ReleaseWhenPending(TimeSpan.FromSeconds(1)));
        await TestWait.Until(() => harness.Transports.Snapshot().Length == 2);
        harness.Current().Enqueue("""{"type":"auth_result","version":1,"status":"ok"}""");
        await TestWait.Until(() => harness.Client.IsAuthenticated);

        await harness.Client.HandleIncomingAsync(
            stale,
            TestFrames.Command("cmd-stale", SessionHarness.DeviceId, "lock", SessionHarness.Now));
        harness.Current().Enqueue(TestFrames.Command("cmd-new", SessionHarness.DeviceId, "lock", SessionHarness.Now));
        await TestWait.Until(() => Results(harness).Any(result => result.CommandId == "cmd-new"));

        Assert.Equal(1, harness.Workstation.Calls);
        Assert.DoesNotContain(Results(harness), result => result.CommandId == "cmd-stale");
    }

    private static async Task<CommandResultFrame> WaitForResultAsync(SessionHarness harness)
    {
        await TestWait.Until(() => Results(harness).Length >= 1);
        return Results(harness)[0];
    }

    private static CommandResultFrame[] Results(SessionHarness harness) =>
        harness.Transports.Snapshot()
            .SelectMany(transport => transport.Sent())
            .Select(TestFrames.ResultOf)
            .Where(result => result is not null)
            .Cast<CommandResultFrame>()
            .ToArray();
}
