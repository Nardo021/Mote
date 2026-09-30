using Mote.Windows.Networking;

namespace Mote.Windows.Ui;

public static class StatusCopy
{
    public static string TrayLabel(ConnectionPhase phase, string? lastError)
    {
        if (phase == ConnectionPhase.Disabled || lastError == RelayCloseReason.DeviceDisabled)
        {
            return "Disabled";
        }

        if (phase == ConnectionPhase.Error)
        {
            return "Needs attention";
        }

        return phase switch
        {
            ConnectionPhase.NotConfigured => "Not configured",
            ConnectionPhase.Disconnected => "Disconnected",
            ConnectionPhase.NetworkUnavailable => "Network unavailable",
            ConnectionPhase.Connecting => "Connecting",
            ConnectionPhase.Authenticating => "Authenticating",
            ConnectionPhase.Connected => "Connected",
            ConnectionPhase.Reconnecting => "Reconnecting",
            ConnectionPhase.Error => "Needs attention",
            ConnectionPhase.Disabled => "Disabled",
            _ => throw new InvalidOperationException($"Unhandled connection phase {phase}."),
        };
    }

    public static string Headline(ConnectionPhase phase, string? lastError)
    {
        if (lastError == RelayCloseReason.DeviceDisabled || phase == ConnectionPhase.Disabled)
        {
            return "This device is disabled in the Mote Dashboard.";
        }

        if (phase == ConnectionPhase.Error)
        {
            return lastError switch
            {
                RelayCloseReason.InvalidCredentials => "The device credential is no longer valid.",
                RelayCloseReason.CredentialRotated => "A new device credential is required.",
                RelayCloseReason.UnsupportedVersion => "This version of Mote is not compatible with the Relay.",
                RelayCloseReason.DeviceDisabled => "This device is disabled in the Mote Dashboard.",
                _ => "Needs attention.",
            };
        }

        return phase switch
        {
            ConnectionPhase.NotConfigured => "Relay is not configured.",
            ConnectionPhase.Disconnected => "Disconnected.",
            ConnectionPhase.NetworkUnavailable => "Network unavailable.",
            ConnectionPhase.Connecting => "Connecting…",
            ConnectionPhase.Authenticating => "Authenticating…",
            ConnectionPhase.Connected => "Connected and ready.",
            ConnectionPhase.Reconnecting => "Reconnecting…",
            ConnectionPhase.Error => "Needs attention.",
            ConnectionPhase.Disabled => "This device is disabled in the Mote Dashboard.",
            _ => throw new InvalidOperationException($"Unhandled connection phase {phase}."),
        };
    }

    public static string Detail(ConnectionPhase phase, string? lastError)
    {
        if (lastError == RelayCloseReason.DeviceDisabled || phase == ConnectionPhase.Disabled)
        {
            return "Enable this device in the Mote Dashboard, then connect again.";
        }

        if (phase == ConnectionPhase.Error)
        {
            return lastError switch
            {
                RelayCloseReason.InvalidCredentials => "Paste the replacement credential from the Dashboard.",
                RelayCloseReason.CredentialRotated => "Paste the replacement credential from the Dashboard.",
                RelayCloseReason.UnsupportedVersion => "Update Mote, or use a Relay that supports this version.",
                _ => "The connection needs attention before remote lock can continue.",
            };
        }

        return phase switch
        {
            ConnectionPhase.NotConfigured => "Save a Relay URL, then pair this device.",
            ConnectionPhase.Disconnected => "Remote lock is paused until you connect.",
            ConnectionPhase.NetworkUnavailable => "Mote will reconnect when the network returns.",
            ConnectionPhase.Connecting => "Opening a session with the Relay.",
            ConnectionPhase.Authenticating => "Checking the device credential.",
            ConnectionPhase.Connected => "This device can receive a remote lock.",
            ConnectionPhase.Reconnecting => "The previous session dropped. Mote is trying again.",
            ConnectionPhase.Error => "The connection needs attention before remote lock can continue.",
            ConnectionPhase.Disabled => "Enable this device in the Mote Dashboard, then connect again.",
            _ => throw new InvalidOperationException($"Unhandled connection phase {phase}."),
        };
    }

    public static bool OffersCredentialReplacement(ConnectionPhase phase, string? lastError) =>
        phase == ConnectionPhase.Error
        && lastError is RelayCloseReason.InvalidCredentials or RelayCloseReason.CredentialRotated;

    public static bool OffersDisconnect(bool wantsConnection, ConnectionPhase phase, bool hasCredential)
    {
        if (!wantsConnection || !hasCredential)
        {
            return false;
        }

        return phase is not (ConnectionPhase.NotConfigured or ConnectionPhase.Error or ConnectionPhase.Disabled);
    }
}

public static class PairingCopy
{
    public static string For(PairingPhase phase, string? error)
    {
        return phase switch
        {
            PairingPhase.Idle => "",
            PairingPhase.CreatingRequest => "Creating a pairing request…",
            PairingPhase.Connecting => "Connecting to the Relay…",
            PairingPhase.Authenticating => "Confirming the pairing request…",
            PairingPhase.PendingApproval => "Waiting for approval in the Mote Dashboard.",
            PairingPhase.Approved => "Paired.",
            PairingPhase.Rejected => "Pairing was declined in the Dashboard.",
            PairingPhase.Expired => "The pairing request expired.",
            PairingPhase.Cancelled => "Pairing cancelled.",
            PairingPhase.Failed => SafeFailure(error),
            _ => throw new InvalidOperationException($"Unhandled pairing phase {phase}."),
        };
    }

    public static bool IsActive(PairingPhase phase) => phase switch
    {
        PairingPhase.CreatingRequest => true,
        PairingPhase.Connecting => true,
        PairingPhase.Authenticating => true,
        PairingPhase.PendingApproval => true,
        PairingPhase.Idle => false,
        PairingPhase.Approved => false,
        PairingPhase.Rejected => false,
        PairingPhase.Expired => false,
        PairingPhase.Cancelled => false,
        PairingPhase.Failed => false,
        _ => throw new InvalidOperationException($"Unhandled pairing phase {phase}."),
    };

    private static string SafeFailure(string? error) => error switch
    {
        "Relay URL is not configured." => "Save a Relay URL before pairing.",
        "The relay rejected the pairing request." => "The Relay rejected the pairing request.",
        "The device credential could not be saved." => "Credential Manager could not store the new credential.",
        "Pairing failed." => "Pairing failed.",
        "The relay returned an invalid pairing response." => "The Relay returned an invalid pairing response.",
        "The relay returned an invalid pairing approval." => "The Relay returned an invalid pairing approval.",
        "Pairing could not be completed." => "Pairing could not be completed.",
        "The pairing socket URL is invalid." => "The pairing connection could not be opened.",
        _ => "Pairing failed.",
    };
}
