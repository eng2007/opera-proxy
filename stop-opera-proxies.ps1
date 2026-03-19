param(
    [string]$BinaryPath = ".\bin\opera-proxy.windows-x64.exe"
)

$ErrorActionPreference = "Stop"

# Resolve the target binary path when possible so we can prefer exact matches.
$resolvedBinaryPath = $null
if (Test-Path $BinaryPath) {
    $resolvedBinaryPath = (Resolve-Path $BinaryPath).Path
}

$binaryLeaf = [System.IO.Path]::GetFileNameWithoutExtension($BinaryPath)
if ([string]::IsNullOrWhiteSpace($binaryLeaf)) {
    $binaryLeaf = "opera-proxy.windows-x64"
}

# Stop every matching opera-proxy process. Prefer exact path match when available.
$allCandidates = @(Get-Process -Name $binaryLeaf -ErrorAction SilentlyContinue)

if (-not $allCandidates -or $allCandidates.Count -eq 0) {
    Write-Host "No matching opera-proxy processes found."
    exit 0
}

$toStop = @()
foreach ($proc in $allCandidates) {
    $include = $true
    if ($resolvedBinaryPath) {
        $include = ($proc.Path -eq $resolvedBinaryPath)
    }
    if ($include) {
        $toStop += [PSCustomObject]@{
            pid  = $proc.Id
            name = $proc.ProcessName
            path = $proc.Path
        }
    }
}

if (-not $toStop -or $toStop.Count -eq 0) {
    Write-Host "No matching opera-proxy processes found for path $resolvedBinaryPath"
    exit 0
}

foreach ($procInfo in $toStop) {
    Stop-Process -Id $procInfo.pid -Force
}

$toStop | Format-Table -AutoSize

Write-Host ""
Write-Host ("Stopped {0} opera-proxy process(es)." -f $toStop.Count)
