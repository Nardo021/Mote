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
    foreach ($storeName in @("My", "Root", "TrustedPublisher")) {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, "CurrentUser")
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
}

$source = (Resolve-Path -LiteralPath $Executable).Path
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("mote-sign-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Force -Path $work | Out-Null
$copy = Join-Path $work "Mote.Windows.exe"
Copy-Item -LiteralPath $source -Destination $copy
$subject = "MoteWinTest$([guid]::NewGuid().ToString('n'))"
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
        -KeyExportPolicy NonExportable `
        -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider"

    & $signtool sign /fd SHA256 /n $subject $copy
    if ($LASTEXITCODE -ne 0) {
        throw "signtool sign failed with exit code $LASTEXITCODE."
    }

    foreach ($storeName in @("Root", "TrustedPublisher")) {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, "CurrentUser")
        try {
            $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
            $store.Add($cert)
        }
        finally {
            $store.Close()
        }
    }

    $verify = & $signtool verify /pa /v $copy 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "signtool verify failed with exit code $LASTEXITCODE.`n$verify"
    }
    if ($verify -notmatch "sha256") {
        throw "Signature digest is not SHA-256.`n$verify"
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $copy
    if ($signature.Status -ne "Valid") {
        throw "Authenticode status is $($signature.Status)."
    }

    $bytes = [System.IO.File]::ReadAllBytes($copy)
    $index = [Math]::Min(0x400, $bytes.Length - 1)
    $bytes[$index] = $bytes[$index] -bxor 0xFF
    [System.IO.File]::WriteAllBytes($copy, $bytes)
    $tampered = Get-AuthenticodeSignature -LiteralPath $copy
    if ($tampered.Status -eq "Valid") {
        throw "Tampered executable still verified."
    }

    $original = Get-AuthenticodeSignature -LiteralPath $source
    if ($original.Status -eq "Valid") {
        throw "Test signing modified the release executable."
    }

    Write-Host "TEST_AUTHENTICODE_SIGNING_PASSED"
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
