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

$results = foreach ($row in $rows) {
    $proxyAddr = "{0}:{1}" -f $row.ip_address, $row.port
    Write-Host ("Google check {0} ({1})" -f $proxyAddr, $row.country_code)

    $tmp = New-TemporaryFile
    try {
        $meta = & curl.exe --silent --show-error --location --max-time 35 `
            --proxy ("https://{0}" -f $proxyAddr) `
            --proxy-user ("{0}:{1}" -f $login, $password) `
            --proxy-insecure `
            -D - `
            -o $tmp.FullName `
            -w "`nCURLMETA code=%{http_code} effective=%{url_effective}`n" `
            "https://www.google.com/search?q=my+ip&hl=en&pws=0" 2>$null
        $body = Get-Content -Raw -Encoding UTF8 $tmp.FullName
    } catch {
        $meta = ""
        $body = ""
    } finally {
        Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
    }

    $metaText = [string]::Join("`n", $meta)
    $effective = ""
    $httpCode = ""
    if ($metaText -match "CURLMETA code=(\d+) effective=(\S+)") {
        $httpCode = $matches[1]
        $effective = $matches[2]
    }

    $googleStatus = "unknown"
    $googleLang = ""
    if ($effective -like "*sorry/index*" -or $body -match "sorry/index") {
        $googleStatus = "challenge"
    } elseif ($body -match '<html[^>]*lang="([^"]+)"') {
        $googleLang = $matches[1]
        $googleStatus = "ok"
    } elseif ($httpCode) {
        $googleStatus = "http_$httpCode"
    }

    [pscustomobject]@{
        requested_country = $row.country_code
        proxy_host = $row.host
        proxy_address = $proxyAddr
        google_status = $googleStatus
        google_lang = $googleLang
        google_effective_url = $effective
    }
}

$results | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $resultsDir "proxy-google-results.csv")
