$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleDir = Split-Path -Parent $scriptDir
$repoDir = Split-Path -Parent $bundleDir
$resultsDir = Join-Path $bundleDir "results"
$binary = Join-Path $repoDir "bin\opera-proxy.windows-x64.exe"

if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir | Out-Null
}

Push-Location $repoDir
try {
    & $binary -list-proxies-all-out (Join-Path $resultsDir "proxies-all-10x.csv") -discover-repeat 10
    & $binary -list-proxies-all -discover-repeat 10 -sort-proxies-by country | Out-File -Encoding UTF8 (Join-Path $resultsDir "proxy-list-output.txt")
} finally {
    Pop-Location
}
