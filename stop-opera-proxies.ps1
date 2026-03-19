param(
    [string]$BinaryPath = ".\bin\opera-proxy.windows-x64.exe",

    [switch]$Json
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
    if ($Json) {
        $jsonPayload = [PSCustomObject]@{
            stopped = 0
            records = @()
            message = "No matching opera-proxy processes found."
        } | ConvertTo-Json -Depth 4 -Compress
        [Console]::Out.WriteLine($jsonPayload)
    } else {
        Write-Host "No matching opera-proxy processes found."
    }
    return
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
    if ($Json) {
        $jsonPayload = [PSCustomObject]@{
            stopped = 0
            records = @()
            message = "No matching opera-proxy processes found for path $resolvedBinaryPath"
        } | ConvertTo-Json -Depth 4 -Compress
        [Console]::Out.WriteLine($jsonPayload)
    } else {
        Write-Host "No matching opera-proxy processes found for path $resolvedBinaryPath"
    }
    return
}

foreach ($procInfo in $toStop) {
    Stop-Process -Id $procInfo.pid -Force
}

if ($Json) {
    $jsonPayload = [PSCustomObject]@{
        stopped = $toStop.Count
        records = $toStop
    } | ConvertTo-Json -Depth 4 -Compress

    [Console]::Out.WriteLine($jsonPayload)
    return
}

$toStop | Format-Table -AutoSize

Write-Host ""
Write-Host ("Stopped {0} opera-proxy process(es)." -f $toStop.Count)
