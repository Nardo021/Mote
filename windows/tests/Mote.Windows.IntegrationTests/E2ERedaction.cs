using System.Text.RegularExpressions;

namespace Mote.Windows.IntegrationTests;

internal static partial class E2ERedaction
{
    public static string Sanitize(string? text, string? password)
    {
        if (string.IsNullOrEmpty(text))
        {
            return "";
        }

        var cleaned = text;
        if (!string.IsNullOrEmpty(password))
        {
            cleaned = cleaned.Replace(password, "[redacted]", StringComparison.Ordinal);
        }

        cleaned = PairSecretPattern().Replace(cleaned, "\"pair_secret\":\"[redacted]\"");
        cleaned = CredentialPattern().Replace(cleaned, "\"credential\":\"[redacted]\"");
        cleaned = PasswordPattern().Replace(cleaned, "\"password\":\"[redacted]\"");
        cleaned = CookiePattern().Replace(cleaned, "mote_admin_session=[redacted]");
        cleaned = AuthorizationPattern().Replace(cleaned, "Authorization: [redacted]");
        return cleaned;
    }

    public static bool ContainsExposedSecret(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        foreach (Match match in ExposedSecretPattern().Matches(text))
        {
            var value = match.Groups[1].Value;
            if (value.Length > 0 && !value.Equals("[redacted]", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    [GeneratedRegex("\"pair_secret\"\\s*:\\s*\"[^\"]*\"", RegexOptions.IgnoreCase)]
    private static partial Regex PairSecretPattern();

    [GeneratedRegex("\"credential\"\\s*:\\s*\"[^\"]*\"", RegexOptions.IgnoreCase)]
    private static partial Regex CredentialPattern();

    [GeneratedRegex("\"password\"\\s*:\\s*\"[^\"]*\"", RegexOptions.IgnoreCase)]
    private static partial Regex PasswordPattern();

    [GeneratedRegex("mote_admin_session=[^;\\s]+", RegexOptions.IgnoreCase)]
    private static partial Regex CookiePattern();

    [GeneratedRegex("Authorization:\\s*\\S+", RegexOptions.IgnoreCase)]
    private static partial Regex AuthorizationPattern();

    [GeneratedRegex("\"(?:pair_secret|credential|password)\"\\s*:\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase)]
    private static partial Regex ExposedSecretPattern();
}
