param(
    [string]$LogsDir = ".\proxy-runs",

    [string]$RunId,

    [int]$Tail = 20,

    [int]$PollMs = 1000,

    [switch]$StdoutOnly,

    [switch]$StderrOnly
)

$ErrorActionPreference = "Stop"

if ($Tail -lt 0) {
    throw "Tail must be >= 0"
}

if ($PollMs -lt 100) {
    throw "PollMs must be >= 100"
}

if ($StdoutOnly -and $StderrOnly) {
    throw "StdoutOnly and StderrOnly cannot be used together"
}

if (-not (Test-Path $LogsDir)) {
    throw "Logs directory not found: $LogsDir"
}

$resolvedLogsDir = (Resolve-Path $LogsDir).Path

# Pick either the requested run directory or the most recent one.
$targetDir = if ($RunId) {
    Join-Path $resolvedLogsDir $RunId
} else {
    $latest = Get-ChildItem -Path $resolvedLogsDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) {
        throw "No run directories found in $resolvedLogsDir"
    }
    $latest.FullName
}

if (-not (Test-Path $targetDir)) {
    throw "Run directory not found: $targetDir"
}

$patterns = if ($StdoutOnly) {
    @("*-stdout.log")
} elseif ($StderrOnly) {
    @("*-stderr.log")
} else {
    @("*-stdout.log", "*-stderr.log")
}

$files = @()
foreach ($pattern in $patterns) {
    $files += Get-ChildItem -Path $targetDir -File -Filter $pattern
}

$files = @($files | Sort-Object Name -Unique)
if (-not $files -or $files.Count -eq 0) {
    throw "No matching log files found in $targetDir"
}

$state = @{}

function Write-PrefixedLines {
    param(
        [string]$Prefix,
        [string[]]$Lines
    )

    foreach ($line in $Lines) {
        Write-Host ("[{0}] {1}" -f $Prefix, $line)
    }
}

Write-Host ("Watching logs in: {0}" -f $targetDir)
Write-Host ("Files: {0}" -f ($files.Name -join ", "))
Write-Host "Press Ctrl+C to stop."
Write-Host ""

# Print the tail of each file first so the current state is visible immediately.
foreach ($file in $files) {
    $initialLines = @()
    if ($Tail -gt 0) {
        $initialLines = @(Get-Content -Path $file.FullName -Tail $Tail -ErrorAction SilentlyContinue)
    }
    if ($initialLines.Count -gt 0) {
        Write-PrefixedLines -Prefix $file.Name -Lines $initialLines
    }

    $lineCount = @(Get-Content -Path $file.FullName -ErrorAction SilentlyContinue).Count
    $state[$file.FullName] = [PSCustomObject]@{
        Name      = $file.Name
        LineCount = $lineCount
    }
}

while ($true) {
    Start-Sleep -Milliseconds $PollMs

    foreach ($file in $files) {
        $currentLines = @(Get-Content -Path $file.FullName -ErrorAction SilentlyContinue)
        $currentCount = $currentLines.Count
        $prevCount = $state[$file.FullName].LineCount

        # If the file was truncated or rotated, restart from the beginning.
        if ($currentCount -lt $prevCount) {
            $prevCount = 0
        }

        if ($currentCount -gt $prevCount) {
            $newLines = @()
            for ($i = $prevCount; $i -lt $currentCount; $i++) {
                $newLines += $currentLines[$i]
            }
            Write-PrefixedLines -Prefix $state[$file.FullName].Name -Lines $newLines
            $state[$file.FullName].LineCount = $currentCount
        }
    }
}
