# Packages the win-x64 publish directory into one portable zip, then checksums that zip.
param(
    [Parameter(Mandatory = $true)][string]$PublishDirectory,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [Parameter(Mandatory = $true)][string]$Commit,
    [Parameter(Mandatory = $true)][string]$SdkVersion,
    [Parameter(Mandatory = $true)][ValidateSet("UNSIGNED_RC", "PRODUCTION_SIGNED")][string]$SigningStatus
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Test-ForbiddenName([string]$Name) {
    $lower = $Name.ToLowerInvariant()
    if ($lower -eq "settings.json" -or $lower -eq ".dev.vars" -or $lower -eq "appsettings.json" -or $lower -eq "appsettings.development.json") {
        return $true
    }
    foreach ($suffix in @(".pdb", ".pfx", ".p12", ".pem", ".key", ".cer", ".crt", ".cs", ".csproj", ".snk", ".ico")) {
        if ($lower.EndsWith($suffix)) {
            return $true
        }
    }
    if ($lower -like "*tests*.dll" -or $lower -like "*testhost*") {
        return $true
    }
    return $false
}

if ($Commit -notmatch "^[0-9a-fA-F]{40}$") {
    throw "Commit must be a 40-character git SHA."
}
if ($SdkVersion -notmatch "^[0-9][0-9A-Za-z.+-]*$") {
    throw "SDK version is malformed."
}

$version = (& node (Join-Path $PSScriptRoot "windows-release-version.mjs")).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
    throw "Windows release version validation failed."
}

$publish = (Resolve-Path -LiteralPath $PublishDirectory).Path
$files = @(Get-ChildItem -LiteralPath $publish -Recurse -File -Force)
if ($files.Count -eq 0) {
    throw "Publish directory is empty."
}

$forbidden = @($files | Where-Object { Test-ForbiddenName $_.Name })
if ($forbidden.Count -gt 0) {
    throw "Publish output contains forbidden files: $($forbidden.Name -join ', ')"
}

$executable = @($files | Where-Object { $_.Name -eq "Mote.Windows.exe" })
if ($executable.Count -ne 1) {
    throw "Publish output must contain exactly one Mote.Windows.exe."
}
$exe = $executable[0]
if ($exe.Length -lt 20MB) {
    throw "Mote.Windows.exe is too small to be a self-contained publish ($($exe.Length) bytes)."
}

$signature = Get-AuthenticodeSignature -LiteralPath $exe.FullName
if ($SigningStatus -eq "UNSIGNED_RC" -and $signature.Status -eq "Valid") {
    throw "Refusing to package a signed executable as UNSIGNED_RC."
}
if ($SigningStatus -eq "PRODUCTION_SIGNED" -and $signature.Status -ne "Valid") {
    throw "Production package requires a valid Authenticode signature. Status: $($signature.Status)"
}

$singleFile = $files.Count -eq 1
$info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exe.FullName)
if ($info.ProductName -ne "Mote") {
    throw "ProductName is '$($info.ProductName)', expected Mote."
}
if ($info.FileVersion -ne "$version.0") {
    throw "FileVersion '$($info.FileVersion)' does not match project version $version."
}
if ($info.ProductVersion -ne $version) {
    throw "ProductVersion '$($info.ProductVersion)' does not match project version $version."
}
if (-not [string]::IsNullOrWhiteSpace($info.CompanyName)) {
    throw "CompanyName must stay empty. Refusing publisher identity '$($info.CompanyName)'."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$artifact = "Mote-Windows-x64-$version.zip"
$zipPath = Join-Path $OutputDirectory $artifact
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    if ($singleFile) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $exe.FullName, "Mote.Windows.exe", [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    else {
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($publish.Length).TrimStart("\", "/")
            $name = "Mote/" + ($relative -replace "\\", "/")
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $file.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
}
finally {
    $zip.Dispose()
}

$packed = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $names = @($packed.Entries | ForEach-Object { $_.FullName })
    foreach ($name in $names) {
        $leaf = [System.IO.Path]::GetFileName($name)
        if (Test-ForbiddenName $leaf) {
            throw "ZIP contains forbidden entry $name."
        }
    }
    $exeEntries = @($names | Where-Object { $_ -eq "Mote.Windows.exe" -or $_ -eq "Mote/Mote.Windows.exe" })
    if ($exeEntries.Count -ne 1) {
        throw "ZIP must contain exactly one Mote.Windows.exe."
    }
    if ($singleFile -and $names.Count -ne 1) {
        throw "Single-file ZIP must contain only Mote.Windows.exe."
    }
}
finally {
    $packed.Dispose()
}

$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$again = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $again) {
    throw "SHA-256 changed while it was being recorded."
}

$utf8 = New-Object System.Text.UTF8Encoding $false
$hashPath = Join-Path $OutputDirectory "Mote-Windows-x64-$version.sha256"
[System.IO.File]::WriteAllText($hashPath, "$hash  $artifact`n", $utf8)
$recorded = ([System.IO.File]::ReadAllText($hashPath).Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0]).ToLowerInvariant()
$third = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($recorded -ne $hash -or $third -ne $hash) {
    throw "SHA-256 file does not match the ZIP."
}

$singleText = if ($singleFile) { "true" } else { "false" }
$manifest = @"
{
  "product": "Mote",
  "version": "$version",
  "platform": "windows",
  "architecture": "x64",
  "runtime_identifier": "win-x64",
  "commit": "$($Commit.ToLowerInvariant())",
  "configuration": "Release",
  "dotnet_sdk": "$SdkVersion",
  "self_contained": true,
  "single_file": $singleText,
  "signing_status": "$SigningStatus",
  "sha256": "$hash"
}
"@
$manifestPath = Join-Path $OutputDirectory "release-manifest.json"
[System.IO.File]::WriteAllText($manifestPath, $manifest.Trim() + "`n", $utf8)
$fourth = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($fourth -ne $hash) {
    throw "Writing the manifest changed the ZIP hash."
}

Write-Host "artifact=$artifact"
Write-Host "bytes=$((Get-Item -LiteralPath $zipPath).Length)"
Write-Host "exe_bytes=$($exe.Length)"
Write-Host "single_file=$singleText"
Write-Host "signing_status=$SigningStatus"
Write-Host "sha256=$hash"
