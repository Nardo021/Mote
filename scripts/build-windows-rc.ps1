# Builds a local unsigned Windows 2.0.0 release candidate.
# Does not lock the workstation, change network adapters, sleep the machine,
# edit credentials, create a Git tag, or create a GitHub Release.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

Invoke-Step node @("scripts/build-windows-icon.mjs")
Invoke-Step node @("scripts/build-windows-icon.mjs", "--check")
Invoke-Step dotnet @("test", "windows/Mote.Windows.sln", "--configuration", "Release", "--verbosity", "minimal")
Invoke-Step dotnet @(
    "publish", "windows/src/Mote.Windows/Mote.Windows.csproj",
    "-c", "Release",
    "-r", "win-x64",
    "--self-contained", "true",
    "--nologo")

$exe = Join-Path $root "windows\src\Mote.Windows\bin\Release\net10.0-windows\win-x64\publish\Mote.Windows.exe"
Invoke-Step node @("scripts/build-windows-icon.mjs", "--verify-exe", $exe)
Write-Host "WINDOWS_RC_EXECUTABLE=$exe"
