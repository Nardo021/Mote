# Starts the published executable, checks that a second copy does not stay running, then removes the process.
param(
    [Parameter(Mandatory = $true)][string]$Executable
)

$ErrorActionPreference = "Stop"

function Get-RunValue {
    $item = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Mote" -ErrorAction SilentlyContinue
    if ($null -eq $item) {
        return $null
    }
    return [string]$item.Mote
}

function Get-MoteCredentialText {
    $listed = & cmdkey.exe /list
    return (($listed | Where-Object { $_ -match "mote" }) -join "`n")
}

$exe = (Resolve-Path -LiteralPath $Executable).Path
if ([System.IO.Path]::GetFileName($exe) -ne "Mote.Windows.exe") {
    throw "Published executable must be named Mote.Windows.exe."
}

$existing = @(Get-Process -Name "Mote.Windows" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
if ($existing.Count -gt 0) {
    throw "A Mote.Windows process is already running. Refusing to smoke-test against it."
}

$beforeRun = Get-RunValue
$beforeCredentials = Get-MoteCredentialText
$moteDirectory = Join-Path $env:LOCALAPPDATA "Mote"
if (Test-Path -LiteralPath $moteDirectory) {
    throw "Refusing to smoke-test because $moteDirectory already exists."
}

$primary = $null
$secondary = $null
$manual = $null
$smokeError = $null

try {
    $primary = Start-Process -FilePath $exe -ArgumentList "--background" -WorkingDirectory (Split-Path -Parent $exe) -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $deadline) {
        if ($primary.HasExited) {
            throw "Published executable exited during startup with code $($primary.ExitCode)."
        }
        Start-Sleep -Milliseconds 500
    }

    $secondary = Start-Process -FilePath $exe -ArgumentList "--background" -WorkingDirectory (Split-Path -Parent $exe) -PassThru -WindowStyle Hidden
    if (-not $secondary.WaitForExit(90000)) {
        throw "Background second instance stayed running."
    }
    if ($primary.HasExited) {
        throw "Primary instance exited when a background second instance started. Exit code $($primary.ExitCode)."
    }

    $manual = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru -WindowStyle Hidden
    if (-not $manual.WaitForExit(90000)) {
        throw "Manual second instance stayed running."
    }
    if ($primary.HasExited) {
        throw "Primary instance exited when a manual second instance started. Exit code $($primary.ExitCode)."
    }

    Start-Sleep -Seconds 2
    if ($primary.HasExited) {
        throw "Primary instance exited after the second-instance checks. Exit code $($primary.ExitCode)."
    }

    $extras = @(Get-Process -Name "Mote.Windows" -ErrorAction SilentlyContinue | Where-Object {
            $_.Id -ne $primary.Id -and $existing -notcontains $_.Id
        })
    if ($extras.Count -gt 0) {
        throw "Unexpected Mote.Windows process(es): $($extras.Id -join ', ')"
    }
}
catch {
    $smokeError = $_
}
finally {
    foreach ($process in @($manual, $secondary, $primary)) {
        if ($null -ne $process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            $process.WaitForExit(15000) | Out-Null
        }
    }
    if (Test-Path -LiteralPath $moteDirectory) {
        Remove-Item -LiteralPath $moteDirectory -Recurse -Force
    }
}

$afterRun = Get-RunValue
if ($beforeRun -ne $afterRun) {
    throw "Smoke test changed the Mote Run startup entry."
}
$afterCredentials = Get-MoteCredentialText
if ($beforeCredentials -ne $afterCredentials) {
    throw "Smoke test changed Credential Manager entries."
}
if (Test-Path -LiteralPath $moteDirectory) {
    throw "Smoke test left $moteDirectory behind."
}
if ($null -ne $smokeError) {
    throw $smokeError
}

Write-Host "PUBLISHED_EXECUTABLE_SMOKE_PASSED"
Write-Host "SMOKE_CLEANUP_PASSED"
