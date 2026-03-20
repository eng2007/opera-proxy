$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleDir = Split-Path -Parent $scriptDir
$resultsDir = Join-Path $bundleDir "results"
$geoPath = Join-Path $resultsDir "proxy-geo-results.csv"
$googlePath = Join-Path $resultsDir "proxy-google-results.csv"

if (-not (Test-Path $geoPath)) {
    throw "Missing $geoPath. Run check-geo-services.ps1 first."
}
if (-not (Test-Path $googlePath)) {
    throw "Missing $googlePath. Run check-google.ps1 first."
}

$geo = Import-Csv $geoPath
$google = Import-Csv $googlePath

$joined = foreach ($row in $geo) {
    $googleRow = $google | Where-Object { $_.proxy_address -eq $row.proxy_address } | Select-Object -First 1
    [pscustomobject]@{
        proxy_address = $row.proxy_address
        requested_country = $row.requested_country
        ipwho = if ($row.ipwho_country_code) { "{0} ({1})" -f $row.ipwho_country, $row.ipwho_country_code } else { "" }
        ipapi = if ($row.ipapi_country_code) { "{0} ({1})" -f $row.ipapi_country, $row.ipapi_country_code } else { "" }
        google = if ($googleRow) {
            if ($googleRow.google_status -eq "ok") { $googleRow.google_lang } else { $googleRow.google_status }
        } else {
            ""
        }
    }
}

$joined | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $resultsDir "proxy-country-compare.csv")
