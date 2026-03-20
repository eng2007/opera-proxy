# Proxy Country Audit Methodology

Date of baseline run: 2026-03-20

## Goal

Collect all unique Opera proxy endpoints returned by `opera-proxy`, then compare how different external services classify those proxies by country.

## Inputs

- Binary: `bin/opera-proxy.windows-x64.exe`
- Discovery mode: all countries
- Repeat count: `10`

## Step 1. Collect unique endpoints

Run `opera-proxy` with:

```powershell
.\bin\opera-proxy.windows-x64.exe -list-proxies-all-out proxies-all-10x.csv -discover-repeat 10
```

This asks SurfEasy discovery for all countries and repeats discovery 10 times per country. `opera-proxy` aggregates and deduplicates endpoints by `country + ip + port`.

Artifacts:

- `results/proxies-all-10x.csv`
- `results/proxy-list-output.txt`

`proxy-list-output.txt` is also used to extract temporary proxy credentials printed by `-list-proxies-all`.

## Step 2. Geo-IP verification with two public services

Each discovered proxy is queried through two public geo services:

- `https://ipwho.is/`
- `https://ipapi.co/json/`

Requests are sent through the discovered Opera proxy itself using:

- HTTPS proxy transport
- Proxy credentials extracted from `proxy-list-output.txt`

Saved fields:

- requested country from discovery
- proxy hostname and `ip:port`
- country reported by `ipwho.is`
- country reported by `ipapi.co`
- whether both services agree

Artifact:

- `results/proxy-geo-results.csv`

## Step 3. Google-facing verification

Each discovered proxy is used to request:

```text
https://www.google.com/search?q=my+ip&hl=en&pws=0
```

For each response we store:

- HTTP result metadata
- effective URL after redirects
- whether Google returned a normal page or anti-bot challenge
- HTML `lang` value when a normal page is returned

Interpretation:

- `google_status=ok` means Google returned a page successfully
- `google_lang` is the visible locale signal from Google, for example `en-SG` or `en-RU`
- `google_status=challenge` means Google served a `sorry` / anti-bot flow instead of a normal result page

Artifact:

- `results/proxy-google-results.csv`

## Step 4. Merge results

Join the geo-service results and Google results by `proxy_address`.

Artifact:

- `results/proxy-country-compare.csv`

## Important caveats

- Geo-IP providers can disagree with each other.
- Google does not necessarily use the same country mapping as public geo-IP services.
- Google may apply anti-bot protection selectively, so some proxies produce `challenge` instead of a usable locale.
- Proxy credentials are temporary and tied to the session that generated `proxy-list-output.txt`.
- Re-running the audit later can produce a different proxy set and different country classifications.
