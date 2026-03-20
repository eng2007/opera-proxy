# Proxy Audit Bundle

This directory contains:

- methodology for the proxy country audit
- PowerShell scripts used to run the audit
- result files produced by the audit

## Layout

- `METHODOLOGY.md` - step-by-step verification method
- `scripts/collect-proxies.ps1` - collects unique proxy endpoints
- `scripts/check-geo-services.ps1` - checks proxies via `ipwho.is` and `ipapi.co`
- `scripts/check-google.ps1` - checks how Google responds for each proxy
- `scripts/merge-results.ps1` - combines geo and Google outputs into one table
- `results/` - generated CSV and TXT files

## Typical usage

Run from repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\proxy-audit-2026-03-20\scripts\collect-proxies.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\proxy-audit-2026-03-20\scripts\check-geo-services.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\proxy-audit-2026-03-20\scripts\check-google.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\proxy-audit-2026-03-20\scripts\merge-results.ps1
```
