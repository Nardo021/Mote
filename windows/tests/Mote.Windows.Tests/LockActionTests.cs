using Mote.Windows.Actions;
using Mote.Windows.Agent;
using Mote.Windows.Security;
using Mote.Windows.Storage;

namespace Mote.Windows.Tests;

public sealed class LockActionTests : IDisposable
{
    private readonly string _directory = Directory.CreateTempSubdirectory("mote-w1-lock").FullName;

    [Fact]
    public void NativeSuccessMapsToCompleted()
    {
        var workstation = new FakeWorkstationLock { Succeeds = true };

        var outcome = new LockAction(workstation).Execute();

        Assert.Equal(LockOutcome.Completed, outcome);
        Assert.Equal(1, workstation.Calls);
    }

    [Fact]
    public void NativeFailureMapsToFailed()
    {
        var workstation = new FakeWorkstationLock { Succeeds = false };

        var outcome = new LockAction(workstation).Execute();

        Assert.Equal(LockOutcome.Failed, outcome);
        Assert.Equal(1, workstation.Calls);
    }

    [Fact]
    public async Task StartingTheAgentDoesNotLockOrReadCredentials()
    {
        var workstation = new FakeWorkstationLock();
        var credentials = new WindowsCredentialStore();
        var settings = new SettingsStore(
            Path.Combine(_directory, "settings.json"),
            () => "77777777-7777-4777-8777-777777777777",
            () => "Test-PC");
        var agent = new AgentCoordinator(settings, credentials, workstation);

        await agent.StartAsync();
        Assert.True(agent.IsRunning);
        await agent.ShutdownAsync();

        Assert.Equal(0, workstation.Calls);
        Assert.False(agent.IsRunning);
        Assert.IsType<WindowsCredentialStore>(agent.Credentials);
    }

    public void Dispose()
    {
        Directory.Delete(_directory, recursive: true);
    }
}

internal sealed class FakeWorkstationLock : IWorkstationLock
{
    public bool Succeeds { get; set; } = true;

    public int Calls { get; private set; }

    public bool TryLock()
    {
        Calls++;
        return Succeeds;
    }
}
