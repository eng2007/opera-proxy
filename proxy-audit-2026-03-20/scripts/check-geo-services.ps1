$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleDir = Split-Path -Parent $scriptDir
$resultsDir = Join-Path $bundleDir "results"
$proxyListPath = Join-Path $resultsDir "proxies-all-10x.csv"
$proxyOutputPath = Join-Path $resultsDir "proxy-list-output.txt"

if (-not (Test-Path $proxyListPath)) {
    throw "Missing $proxyListPath. Run collect-proxies.ps1 first."
}
if (-not (Test-Path $proxyOutputPath)) {
    throw "Missing $proxyOutputPath. Run collect-proxies.ps1 first."
}

$lines = Get-Content -Encoding UTF8 $proxyOutputPath
$login = (($lines | Select-String "^Proxy login:").Line -replace "^Proxy login:\s*", "").Trim()
$password = (($lines | Select-String "^Proxy password:").Line -replace "^Proxy password:\s*", "").Trim()
if (-not $login -or -not $password) {
    throw "Proxy credentials were not found in $proxyOutputPath"
}

$rows = Import-Csv $proxyListPath | Sort-Object country_code, ip_address, port -Unique

function Invoke-GeoService([string]$proxyAddr, [string]$url) {
    try {
        $raw = & curl.exe --silent --show-error --max-time 35 `
            --proxy ("https://{0}" -f $proxyAddr) `
            --proxy-user ("{0}:{1}" -f $login, $password) `
            --proxy-insecure `
            $url 2>$null
        if (-not $raw) {
            return $null
        }
        return $raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

$results = foreach ($row in $rows) {
    $proxyAddr = "{0}:{1}" -f $row.ip_address, $row.port
    Write-Host ("Geo check {0} ({1})" -f $proxyAddr, $row.country_code)

    $ipwho = Invoke-GeoService $proxyAddr "https://ipwho.is/"
    $ipapi = Invoke-GeoService $proxyAddr "https://ipapi.co/json/"

    [pscustomobject]@{
        requested_country = $row.country_code
        proxy_host = $row.host
        proxy_address = $proxyAddr
        ipwho_country = if ($ipwho) { $ipwho.country } else { "" }
        ipwho_country_code = if ($ipwho) { $ipwho.country_code } else { "" }
        ipwho_ip = if ($ipwho) { $ipwho.ip } else { "" }
        ipapi_country = if ($ipapi) { $ipapi.country_name } else { "" }
        ipapi_country_code = if ($ipapi) { $ipapi.country_code } else { "" }
        ipapi_ip = if ($ipapi) { $ipapi.ip } else { "" }
        agree = if ($ipwho -and $ipapi -and $ipwho.country_code -eq $ipapi.country_code) { "yes" } else { "no" }
    }
}

$results | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $resultsDir "proxy-geo-results.csv")
$results | Format-Table -AutoSize | Out-String -Width 220 | Set-Content -Encoding UTF8 (Join-Path $resultsDir "proxy-geo-results.txt")
