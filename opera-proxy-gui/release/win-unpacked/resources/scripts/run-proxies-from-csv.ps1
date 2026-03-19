param(
    [string]$CsvPath = ".\proxies.csv",

    [int]$StartPort = 8080,

    [string]$BinaryPath = ".\bin\opera-proxy.windows-x64.exe",

    [string]$BindAddress = "127.0.0.1",

    [string]$LogsDir = ".\proxy-runs",

    [switch]$OnlyOkSpeed,

    [Nullable[int]]$MaxSpeedMs,

    [ValidateSet("speed", "country", "ip")]
    [string]$SortBy = "speed",

    [switch]$NoStopExisting,

    [switch]$ShowWindows,

    [switch]$Json,

    [string]$JsonOutPath
)

$ErrorActionPreference = "Stop"

# Validate user inputs and resolve important paths up front.
if (-not (Test-Path $CsvPath)) {
    throw "CSV file not found: $CsvPath"
}

if (-not (Test-Path $BinaryPath)) {
    throw "Binary not found: $BinaryPath"
}

if ($StartPort -lt 1 -or $StartPort -gt 65535) {
    throw "StartPort must be in range 1..65535"
}

$resolvedCsvPath = (Resolve-Path $CsvPath).Path
$resolvedBinaryPath = (Resolve-Path $BinaryPath).Path
$stopScriptPath = Join-Path $PSScriptRoot "stop-opera-proxies.ps1"

if (-not $NoStopExisting) {
    if (-not (Test-Path $stopScriptPath)) {
        throw "Stop script not found: $stopScriptPath"
    }

    if (-not $Json) {
        Write-Host "Stopping existing opera-proxy processes before launch..."
        & $stopScriptPath -BinaryPath $resolvedBinaryPath
    } else {
        & $stopScriptPath -BinaryPath $resolvedBinaryPath | Out-Null
    }
}

$rows = Import-Csv -Path $resolvedCsvPath
if (-not $rows -or $rows.Count -eq 0) {
    throw "CSV has no data rows: $resolvedCsvPath"
}

# Apply optional filters based on speed-check result and threshold.
if ($OnlyOkSpeed) {
    $rows = @($rows | Where-Object { $_.speed_status -eq "ok" })
    if (-not $rows -or $rows.Count -eq 0) {
        throw "No rows with speed_status=ok were found in $resolvedCsvPath"
    }
}

if ($null -ne $MaxSpeedMs) {
    if ($MaxSpeedMs.Value -lt 0) {
        throw "MaxSpeedMs must be >= 0"
    }

    foreach ($requiredColumn in @("speed_ms", "speed_status")) {
        if (-not ($rows[0].PSObject.Properties.Name -contains $requiredColumn)) {
            throw "CSV must contain column '$requiredColumn' when -MaxSpeedMs is used"
        }
    }

    $rows = @(
        $rows | Where-Object {
            $_.speed_status -eq "ok" -and
            -not [string]::IsNullOrWhiteSpace($_.speed_ms) -and
            [int]$_.speed_ms -le $MaxSpeedMs.Value
        }
    )

    if (-not $rows -or $rows.Count -eq 0) {
        throw "No rows matched MaxSpeedMs <= $($MaxSpeedMs.Value)"
    }
}

foreach ($requiredColumn in @("country_code", "ip_address", "port")) {
    if (-not ($rows[0].PSObject.Properties.Name -contains $requiredColumn)) {
        throw "CSV must contain column '$requiredColumn'"
    }
}

# Sort rows before launching so the most relevant proxies start first.
$rows = switch ($SortBy) {
    "country" {
        @($rows | Sort-Object country_code, ip_address, @{ Expression = { [int]$_.port } })
    }
    "ip" {
        @($rows | Sort-Object ip_address, @{ Expression = { [int]$_.port } }, country_code)
    }
    default {
        @(
            $rows | Sort-Object `
                @{ Expression = { if ($_.speed_status -eq "ok" -and -not [string]::IsNullOrWhiteSpace($_.speed_ms)) { 0 } else { 1 } } }, `
                @{ Expression = { if ($_.speed_status -eq "ok" -and -not [string]::IsNullOrWhiteSpace($_.speed_ms)) { [int]$_.speed_ms } else { [int]::MaxValue } } }, `
                country_code, `
                ip_address, `
                @{ Expression = { [int]$_.port } }
        )
    }
}

# Prepare a new log directory for this launch batch.
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$runLogsDir = Join-Path (Resolve-Path $LogsDir).Path $runId
New-Item -ItemType Directory -Path $runLogsDir | Out-Null

$launched = @()
$currentPort = $StartPort

foreach ($row in $rows) {
    $countryCode = [string]$row.country_code
    $remoteIp = [string]$row.ip_address
    $remotePort = [string]$row.port

    if ([string]::IsNullOrWhiteSpace($countryCode) -or [string]::IsNullOrWhiteSpace($remoteIp) -or [string]::IsNullOrWhiteSpace($remotePort)) {
        Write-Warning "Skipping row with missing required values: country_code='$countryCode' ip_address='$remoteIp' port='$remotePort'"
        continue
    }

    if ($currentPort -gt 65535) {
        throw "Port range exhausted. Last attempted local port: $currentPort"
    }

    # Each CSV row becomes a standalone local proxy bound to a unique port.
    $bind = "{0}:{1}" -f $BindAddress, $currentPort
    $overrideAddress = "{0}:{1}" -f $remoteIp, $remotePort
    $safeCountry = $countryCode.ToUpperInvariant()
    $stdoutPath = Join-Path $runLogsDir ("{0}-{1}-stdout.log" -f $safeCountry, $currentPort)
    $stderrPath = Join-Path $runLogsDir ("{0}-{1}-stderr.log" -f $safeCountry, $currentPort)

    $arguments = @(
        "-country", $safeCountry,
        "-bind-address", $bind,
        "-override-proxy-address", $overrideAddress
    )

    $process = Start-Process `
        -FilePath $resolvedBinaryPath `
        -ArgumentList $arguments `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -WindowStyle $(if ($ShowWindows) { "Normal" } else { "Hidden" }) `
        -PassThru

    $launched += [PSCustomObject]@{
        pid          = $process.Id
        country_code = $safeCountry
        local_proxy  = $bind
        remote_proxy = $overrideAddress
        speed_ms     = $row.speed_ms
        speed_status = $row.speed_status
        stdout_log   = $stdoutPath
        stderr_log   = $stderrPath
    }

    $currentPort++
}

if ($launched.Count -eq 0) {
    throw "No proxy processes were launched."
}

if ($Json -or -not [string]::IsNullOrWhiteSpace($JsonOutPath)) {
    $jsonPayload = [PSCustomObject]@{
        records      = $launched
        launched     = $launched.Count
        sort_order   = $SortBy
        logs_dir     = $runLogsDir
        source_csv   = $resolvedCsvPath
        start_port   = $StartPort
        bind_address = $BindAddress
    } | ConvertTo-Json -Depth 5 -Compress

    if (-not [string]::IsNullOrWhiteSpace($JsonOutPath)) {
        $jsonDir = Split-Path -Parent $JsonOutPath
        if (-not [string]::IsNullOrWhiteSpace($jsonDir) -and -not (Test-Path $jsonDir)) {
            New-Item -ItemType Directory -Path $jsonDir | Out-Null
        }

        [System.IO.File]::WriteAllText($JsonOutPath, $jsonPayload, [System.Text.Encoding]::UTF8)
    }

    if ($Json) {
        [Console]::Out.WriteLine($jsonPayload)
    }

    return
}

$launched | Format-Table -AutoSize

Write-Host ""
Write-Host ("Launched {0} proxy process(es)." -f $launched.Count)
Write-Host ("Sort order: {0}" -f $SortBy)
Write-Host ("Logs directory: {0}" -f $runLogsDir)
