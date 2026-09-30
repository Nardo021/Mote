# Signs a discarded copy with an ephemeral certificate. The release executable is left untouched.
param(
    [Parameter(Mandatory = $true)][string]$Executable
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Find-SignTool {
    $roots = @(
        (Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"),
        (Join-Path $env:ProgramFiles "Windows Kits\10\bin")
    )
    $found = foreach ($root in $roots) {
        if (Test-Path -LiteralPath $root) {
            Get-ChildItem -LiteralPath $root -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\x64\\signtool.exe$' }
        }
    }
    $best = $found | Sort-Object FullName -Descending | Select-Object -First 1
    if ($null -eq $best) {
        throw "SignTool was not found."
    }
    return $best.FullName
}

function Remove-Certificate([System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("My", "CurrentUser")
    try {
        $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $matches = $store.Certificates.Find(
            [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            $Certificate.Thumbprint,
            $false)
        foreach ($match in $matches) {
            $store.Remove($match)
        }
    }
    finally {
        $store.Close()
    }
}

$source = (Resolve-Path -LiteralPath $Executable).Path
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("mote-sign-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$copy = Join-Path $work "Mote.Windows.exe"
Copy-Item -LiteralPath $source -Destination $copy
$subject = "MoteWinTest$([guid]::NewGuid().ToString('n'))"
$pfx = Join-Path $work "test.pfx"
$cert = $null

try {
    $signtool = Find-SignTool
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject "CN=$subject" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -HashAlgorithm SHA256 `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -NotAfter (Get-Date).AddHours(2) `
        -KeyExportPolicy Exportable `
        -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider"

    $password = [guid]::NewGuid().ToString("n") + [guid]::NewGuid().ToString("n")
    $secure = ConvertTo-SecureString -String $password -AsPlainText -Force
    Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null
    Write-Host "phase=sign"
    & $signtool sign /fd SHA256 /f $pfx /p $password $copy
    $signExit = $LASTEXITCODE
    $password = $null
    $secure = $null
    Remove-Item -LiteralPath $pfx -Force
    if ($signExit -ne 0) {
        throw "signtool sign failed with exit code $signExit."
    }

    Write-Output "phase=verify"
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $verify = & $signtool verify /pa /v $copy 2>&1 | ForEach-Object { "$_" } | Out-String
    $ErrorActionPreference = $previousErrorAction
    if ($verify -notmatch "Hash of file \(sha256\)") {
        throw "Signature digest is not SHA-256.`n$verify"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $copy
    if ($null -eq $signature.SignerCertificate) {
        throw "Signed executable has no signer certificate."
    }
    if ($signature.SignerCertificate.SignatureAlgorithm.FriendlyName -notmatch "sha256") {
        throw "Signer algorithm is $($signature.SignerCertificate.SignatureAlgorithm.FriendlyName)."
    }
    if ($signature.Status -eq "HashMismatch" -or $signature.Status -eq "NotSigned") {
        throw "Authenticode status before tamper is $($signature.Status)."
    }

    $bytes = [System.IO.File]::ReadAllBytes($copy)
    $index = [Math]::Min(0x400, $bytes.Length - 1)
    $bytes[$index] = $bytes[$index] -bxor 0xFF
    [System.IO.File]::WriteAllBytes($copy, $bytes)
    $tampered = Get-AuthenticodeSignature -LiteralPath $copy
    if ($tampered.Status -ne "HashMismatch") {
        throw "Tampered executable status is $($tampered.Status)."
    }

    $original = Get-AuthenticodeSignature -LiteralPath $source
    if ($original.Status -eq "Valid") {
        throw "Test signing modified the release executable."
    }

    Write-Host "TEST_AUTHENTICODE_SIGNING_PASSED"
    Write-Host "File digest is SHA-256. The ephemeral certificate is not a trusted root. Tampering changes the status to HashMismatch."
    Write-Host "The signed file was a discarded copy. signing_status of the release artifact remains UNSIGNED_RC."
}
finally {
    if ($null -ne $cert) {
        Remove-Certificate $cert
    }
    if (Test-Path -LiteralPath $work) {
        Remove-Item -LiteralPath $work -Recurse -Force
    }
}
