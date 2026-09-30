namespace Mote.Windows.Protocol;

public static class CommandResultStatuses
{
    public const string Completed = "completed";

    public const string Failed = "failed";

    public const string Expired = "expired";

    public const string Invalid = "invalid";

    public const string Unsupported = "unsupported";

    public const string PermissionRequired = "permission_required";

    public static readonly string[] All =
    [
        Completed,
        Failed,
        Expired,
        Invalid,
        Unsupported,
        PermissionRequired,
    ];

    public static bool IsKnown(string status) => status switch
    {
        Completed or Failed or Expired or Invalid or Unsupported or PermissionRequired => true,
        _ => false,
    };
}
