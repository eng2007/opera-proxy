# Proxy Listing Extensions

This document describes the custom proxy-listing features added on top of the original `opera-proxy` behavior.

## What Was Added

The project now supports:

- listing proxy endpoints for one or more countries with repeated discovery and deduplication
- listing proxy endpoints for all countries
- optional proxy speed estimation
- sorting proxy lists by speed, country, or IP
- saving proxy lists directly to a CSV file
- selecting a custom resource for proxy speed checks

These features are implemented in the local modified build of this repository and are available in:

- `bin\opera-proxy.windows-x64.exe`

## New Flags

| Flag | Type | Description |
| --- | --- | --- |
| `-list-proxies-all` | bool | Lists proxy endpoints for all countries, or for countries selected by `-country` if `-country` was explicitly passed. |
| `-list-proxies-all-out` | string | Saves the proxy list directly to a CSV file. Automatically enables `-list-proxies-all`. |
| `-discover-repeat` | int | Repeats `Discover` requests and merges unique results. Useful when API responses vary between calls. |
| `-estimate-proxy-speed` | bool | Measures proxy response time for proxy-list output. |
| `-proxy-speed-test-url` | string | URL used for proxy speed checks. |
| `-proxy-speed-timeout` | duration | Timeout for one proxy speed check. |
| `-proxy-speed-dl-limit` | int | Download byte limit for one proxy speed check. |
| `-sort-proxies-by` | string | Sort order for proxy lists: `speed`, `country`, `ip`. |

## Updated Behavior Of `-country`

The meaning of `-country` now depends on the mode.

Normal proxy mode:

- `-country EU` means "run proxy through EU"

Listing mode with `-list-proxies`:

- `-country EU -list-proxies` lists proxies for `EU`

Listing mode with `-list-proxies-all` or `-list-proxies-all-out`:

- if `-country` is not passed explicitly, all countries are used
- if `-country EU` is passed explicitly, only `EU` is used
- if `-country EU,AS` is passed explicitly, only `EU` and `AS` are used
- if `-country ALL` is passed explicitly, all countries are used

Important nuance:

- the default value of `-country` is still `EU`, but for `-list-proxies-all` modes that default is ignored unless the user explicitly typed `-country`

## Repeated Discovery And Deduplication

`-discover-repeat` repeats API discovery several times and merges unique `country + ip + port` combinations.

This helps when the upstream API rotates endpoints between requests.

Example:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all -discover-repeat 5
```

If the API always returns the same endpoints, increasing `-discover-repeat` will not add new rows.

## Proxy Speed Estimation

Speed estimation is based on a real HTTP `GET` request through each discovered proxy endpoint.

It measures practical response time rather than plain ICMP ping.

What is included in the check:

- connection to the proxy endpoint
- proxy tunnel setup
- TLS and HTTP request to the test resource
- reading the response body, optionally limited by `-proxy-speed-dl-limit`

Related flags:

- `-estimate-proxy-speed`
- `-proxy-speed-test-url`
- `-proxy-speed-timeout`
- `-proxy-speed-dl-limit`

Default speed test URL:

- `https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js`

Important nuances:

- `-list-proxies-all` automatically enables speed estimation
- `-list-proxies-all-out` also automatically enables speed estimation
- failed checks do not stop the whole listing, but the row gets an error in `speed_status`
- if the test resource has a bad or expired TLS certificate, speed checks will fail for all proxies even if the proxies themselves are fine

Example of a TLS-related failure cause:

- the chosen test URL may have an expired certificate, which results in an error like `x509: certificate has expired or is not yet valid`

## Sorting

Proxy list output can now be sorted with:

- `-sort-proxies-by speed`
- `-sort-proxies-by country`
- `-sort-proxies-by ip`

Behavior:

- `speed`: successful speed checks first, fastest rows first, failed checks below
- `country`: grouped by country code and then by address
- `ip`: ordered by IP and port

Examples:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all -sort-proxies-by speed
```

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all -sort-proxies-by country
```

```powershell
.\bin\opera-proxy.windows-x64.exe -country EU -list-proxies -estimate-proxy-speed -sort-proxies-by ip
```

## CSV Output

`-list-proxies-all-out <file>` writes the list directly to a CSV file.

Behavior:

- automatically enables `-list-proxies-all`
- automatically enables speed estimation
- writes only the CSV header and table rows
- does not write service lines like `Proxy login`, `Proxy password`, or `Proxy-Authorization`

Current CSV columns:

- `country_code`
- `country_name`
- `host`
- `ip_address`
- `port`
- `speed_ms` if speed estimation is enabled
- `speed_status` if speed estimation is enabled

Example:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all-out proxies.csv
```

Filter by countries:

```powershell
.\bin\opera-proxy.windows-x64.exe -country EU,AS -list-proxies-all-out proxies.csv
```

Force all countries explicitly:

```powershell
.\bin\opera-proxy.windows-x64.exe -country ALL -list-proxies-all-out proxies.csv
```

Use a custom test resource:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all-out proxies.csv -proxy-speed-test-url https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js
```

## Output Format Differences

`-list-proxies` to console:

- still prints service lines with credentials before the table

`-list-proxies-all-out` to file:

- writes only CSV table data

This difference is intentional.

## Typical Usage Scenarios

List all countries on screen with speed estimation and repeated discovery:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all -discover-repeat 5
```

List only Europe and Asia on screen:

```powershell
.\bin\opera-proxy.windows-x64.exe -country EU,AS -list-proxies-all -discover-repeat 5
```

Save all countries to CSV sorted by speed:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all-out proxies.csv -discover-repeat 5 -sort-proxies-by speed
```

Save only Europe to CSV:

```powershell
.\bin\opera-proxy.windows-x64.exe -country EU -list-proxies-all-out proxies.csv
```

List one country with manual speed estimation:

```powershell
.\bin\opera-proxy.windows-x64.exe -country EU -list-proxies -estimate-proxy-speed
```

Use a different speed-check target:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all -proxy-speed-test-url https://example.com/file.bin
```

## Known Limitations

- speed estimation depends on the health of the selected test URL
- if the target resource is slow, blocked, or has TLS issues, speed results become unreliable
- `discover-repeat` only helps if upstream responses actually vary
- `host` values in exported tables are generated labels like `eu11.sec-tunnel.com`; they are convenient names for rows, not proof that the API returned exactly that hostname

## Build Reminder

Windows build script:

```powershell
.\build-windows.bat
```

Output binary:

```text
bin\opera-proxy.windows-x64.exe
```
