# GUI App Design For `opera-proxy`

This document describes a desktop GUI application for managing the local modified `opera-proxy` workflow.

## Goals

The GUI should make it easy to:

- generate proxy lists from SurfEasy / Opera endpoints
- filter and sort proxy candidates
- save proxy lists to CSV
- launch many local proxy instances from CSV
- stop running local proxy instances
- inspect logs in one window
- manage presets for speed checks and launch rules

The GUI is a desktop control panel over the existing CLI and helper scripts, not a rewrite of the network logic.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33+ |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Build | Vite + electron-vite |
| Packaging | electron-builder |

## Product Strategy

The safest design is:

- keep `opera-proxy` core in Go as-is
- keep existing PowerShell and batch automation where useful
- let Electron orchestrate binary execution, logs, CSV handling, and process lifecycle

This reduces risk because:

- proxy behavior remains the same as tested CLI behavior
- GUI development stays focused on orchestration and usability
- the app can support both beginner and advanced workflows

## User Personas

### Basic user

Needs:

- one button to fetch proxies
- easy sorting by speed
- one button to launch top proxies
- visible local ports

### Power user

Needs:

- country filters
- custom speed test URL
- repeated discovery
- custom launch thresholds
- CSV import/export
- raw logs

## Core User Flows

### Flow 1: Generate proxy list

1. user opens "Discover"
2. chooses countries or all countries
3. sets `discover-repeat`
4. optionally enables speed estimation
5. clicks "Generate"
6. app runs `opera-proxy.windows-x64.exe` with listing flags
7. app parses table output or reads generated CSV
8. results appear in a table

### Flow 2: Save CSV

1. user clicks "Export CSV"
2. chooses file path
3. app calls `-list-proxies-all-out` or writes current table data
4. app confirms saved file path

### Flow 3: Launch proxies

1. user selects current proxy dataset or imports CSV
2. sets start port, max speed, sort mode, bind address
3. chooses whether to stop existing proxies first
4. clicks "Launch"
5. app runs `run-proxies-from-csv.ps1`
6. app captures launched process list
7. running local proxies appear in dashboard

### Flow 4: Monitor logs

1. user selects a launch run
2. app opens live log viewer
3. app runs `tail-proxy-logs.ps1` or directly tails log files
4. user filters stdout, stderr, port, country

### Flow 5: Stop proxies

1. user clicks "Stop All"
2. app runs `stop-opera-proxies.ps1`
3. status refreshes

## Information Architecture

Recommended main navigation:

- Dashboard
- Discover
- Launch
- Runs
- Logs
- Settings

### Dashboard

Purpose:

- current high-level status
- number of running proxies
- last discovery run summary
- quick actions

Widgets:

- running proxy count
- latest CSV file
- latest launch run
- buttons: Discover, Launch, Stop All, Open Logs

### Discover

Purpose:

- generate and inspect proxy candidates

Controls:

- country selector
- "All countries" toggle
- discover repeat
- estimate speed toggle
- proxy speed test URL
- proxy speed timeout
- proxy speed download limit
- sort mode
- generate button
- export CSV button

Table columns:

- country code
- country name
- host
- ip address
- port
- speed ms
- speed status

Actions:

- copy row
- pin row
- send selected rows to Launch

### Launch

Purpose:

- launch local proxy fleet from current dataset or CSV

Controls:

- source: current table or CSV file
- start port
- bind address
- sort mode
- only `speed_status=ok`
- max speed ms
- stop existing before launch
- show windows
- launch button

Results panel:

- pid
- country code
- local proxy address
- remote proxy address
- speed ms
- speed status
- stdout log path
- stderr log path

### Runs

Purpose:

- inspect historical launch runs

List fields:

- run id
- timestamp
- log directory
- launched process count

Actions:

- open logs
- relaunch using same CSV and options
- export run manifest

### Logs

Purpose:

- live and historical log viewing

Controls:

- run selector
- stdout only
- stderr only
- search box
- filter by port
- filter by country
- auto-scroll toggle

### Settings

Purpose:

- configure defaults and paths

Settings:

- binary path
- scripts path
- default CSV path
- default logs dir
- default country selection
- default sort mode
- default speed test URL
- default launch start port
- theme

## Desktop Architecture

Recommended Electron structure:

```text
electron/
  main/
    index.ts
    ipc/
      proxy.ts
      files.ts
      logs.ts
      settings.ts
    services/
      processManager.ts
      proxyCliService.ts
      csvService.ts
      runService.ts
      logService.ts
      settingsService.ts
    types/
      proxy.ts
      run.ts
      settings.ts
  preload/
    index.ts
src/
  app/
  pages/
    DashboardPage.tsx
    DiscoverPage.tsx
    LaunchPage.tsx
    RunsPage.tsx
    LogsPage.tsx
    SettingsPage.tsx
  components/
  features/
    discover/
    launch/
    logs/
    runs/
    settings/
  store/
    useAppStore.ts
    slices/
  lib/
    api.ts
    formats.ts
    validators.ts
```

## Process Model

The Electron main process should own all OS process execution.

Why:

- avoids exposing filesystem and process control to renderer
- simpler security model
- cleaner IPC boundary

The renderer should never spawn CLI tools directly.

Main process responsibilities:

- run `opera-proxy.windows-x64.exe`
- run PowerShell scripts
- read and write CSV files
- detect running proxy processes
- stream logs
- persist settings

Renderer responsibilities:

- forms
- tables
- filters
- status UI
- user interactions

## Integration Approach

There are two valid approaches.

### Option A: Script-first integration

Electron calls:

- `run-proxies-from-csv.ps1`
- `stop-opera-proxies.ps1`
- `tail-proxy-logs.ps1`
- `opera-proxy.windows-x64.exe` for discovery

Pros:

- fastest to implement
- minimal duplication
- stays aligned with existing automation

Cons:

- parsing script output is more fragile
- less structured runtime state

### Option B: Service-first integration

Electron main process directly:

- runs `opera-proxy.windows-x64.exe`
- parses CSV and logs in Node
- manages launch/stop logic itself

Pros:

- cleaner IPC and structured data
- better status reporting
- less dependence on shell behavior

Cons:

- more implementation work

Recommended approach:

- start with hybrid mode
- use CLI for discovery
- use scripts for short-term launch/stop
- gradually migrate launch/stop/tailing into Node services

## IPC Design

Expose a minimal typed API from preload:

```ts
interface ProxyApi {
  discover(input: DiscoverInput): Promise<DiscoverResult>
  exportCsv(input: ExportCsvInput): Promise<{ path: string }>
  importCsv(path: string): Promise<ProxyRow[]>
  launchFromCsv(input: LaunchInput): Promise<LaunchResult>
  stopAll(input?: { binaryPath?: string }): Promise<StopResult>
  getRuns(): Promise<RunSummary[]>
  getRunFiles(runId: string): Promise<LogFileSummary[]>
  tailLogs(input: TailInput): Promise<TailSessionHandle>
  stopTail(sessionId: string): Promise<void>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>
}
```

Renderer receives structured data, not raw terminal text when possible.

## Data Models

### ProxyRow

```ts
type ProxyRow = {
  countryCode: string
  countryName: string
  host: string
  ipAddress: string
  port: number
  speedMs?: number
  speedStatus?: string
}
```

### LaunchRecord

```ts
type LaunchRecord = {
  pid: number
  countryCode: string
  localProxy: string
  remoteProxy: string
  speedMs?: number
  speedStatus?: string
  stdoutLog: string
  stderrLog: string
}
```

### RunSummary

```ts
type RunSummary = {
  id: string
  createdAt: string
  logsDir: string
  processCount: number
}
```

### AppSettings

```ts
type AppSettings = {
  binaryPath: string
  defaultCsvPath: string
  logsDir: string
  defaultStartPort: number
  defaultBindAddress: string
  defaultSortMode: "speed" | "country" | "ip"
  defaultSpeedTestUrl: string
  defaultSpeedTimeoutMs: number
  defaultSpeedDlLimit: number
  stopExistingBeforeLaunch: boolean
}
```

## Zustand Store Design

Suggested slices:

- `settingsSlice`
- `discoverSlice`
- `launchSlice`
- `runsSlice`
- `logsSlice`
- `uiSlice`

### `discoverSlice`

State:

- current filters
- loading state
- current rows
- selected rows
- current source file
- last discover metadata

### `launchSlice`

State:

- launch options
- current running records
- last launch result
- stop status

### `logsSlice`

State:

- active run id
- active tail session
- visible log entries
- filters

## UI Component Breakdown

Shared components:

- `AppShell`
- `Sidebar`
- `Topbar`
- `SectionCard`
- `DataTable`
- `Toolbar`
- `ConfirmDialog`
- `PathPickerField`
- `EmptyState`
- `StatusBadge`
- `MetricCard`

Feature components:

- `DiscoverFiltersPanel`
- `ProxyTable`
- `LaunchOptionsPanel`
- `RunningProxyTable`
- `RunHistoryList`
- `LiveLogViewer`
- `SettingsForm`

## Styling Direction

Use Tailwind with a desktop operations-console feel.

Suggested visual direction:

- light neutral base by default
- strong accent colors for state
- green for healthy
- amber for warnings
- red for failing logs / dead processes
- compact monospace data areas for logs and proxy addresses

Suggested UI patterns:

- sticky filters above tables
- split-pane launch + results view
- full-height log viewer
- keyboard-friendly tables

## State Transitions

### Discover

- `idle -> loading -> loaded`
- `idle -> loading -> error`

### Launch

- `idle -> starting -> running`
- `running -> stopping -> idle`
- `starting -> error`

### Logs

- `idle -> tailing`
- `tailing -> stopped`
- `tailing -> error`

## Error Handling

Need clear user-facing errors for:

- binary not found
- scripts not found
- CSV missing required columns
- no rows after filtering
- speed test URL failures
- TLS certificate errors
- port range exhaustion
- process launch failures
- permission issues writing files

Display strategy:

- toast for transient success
- inline error banner for actionable errors
- log details drawer for raw stderr

## Security Model

Recommended Electron settings:

- `contextIsolation: true`
- `nodeIntegration: false`
- strict preload bridge
- no direct shell execution from renderer

IPC handlers should validate:

- file paths
- numeric ranges
- enums
- boolean flags

## Persistence

Store app settings in:

- `app.getPath("userData")`

Suggested persisted files:

- `settings.json`
- `recent-runs.json`
- optional `presets.json`

## Presets

Useful preset types:

- discovery preset
- launch preset
- export preset

Example launch preset:

- countries = `ALL`
- discoverRepeat = `5`
- onlyOkSpeed = `true`
- maxSpeedMs = `1200`
- sortBy = `speed`
- startPort = `8080`

## Packaging

`electron-builder` targets:

- Windows NSIS installer
- portable zip

Bundle strategy:

- package frontend and Electron app normally
- ship `opera-proxy.windows-x64.exe`
- ship helper PowerShell scripts
- optionally ship generated docs

Recommended runtime assets folder:

```text
resources/
  bin/
    opera-proxy.windows-x64.exe
  scripts/
    run-proxies-from-csv.ps1
    stop-opera-proxies.ps1
    tail-proxy-logs.ps1
```

At runtime the app should resolve asset paths from packaged resources, not from dev-relative paths.

## Development Mode

During development:

- use `electron-vite`
- point binary path to local repo binary
- point script paths to local repo scripts

Useful developer features:

- "Open logs directory"
- "Open CSV file"
- "Reveal binary"
- "Copy command"

## Suggested Milestones

### Milestone 1

- Electron shell
- React layout
- settings persistence
- discover page
- proxy table
- CSV export/import

### Milestone 2

- launch page
- run script integration
- stop script integration
- running proxy table

### Milestone 3

- live log viewer
- run history
- presets
- stronger error UX

### Milestone 4

- migrate script logic into Electron main services where beneficial
- richer health/status checks
- packaged installer polish

## Recommended First Version Scope

For v1, include:

- Discover page
- CSV export
- Launch page from CSV
- Stop All
- Log viewer
- Settings

Skip initially:

- multi-profile accounts
- remote sync
- automatic proxy health restarts
- chart-heavy analytics

## Best Next Step

The best implementation path is:

1. scaffold Electron + React + TypeScript app
2. build typed preload API
3. implement settings and binary path resolution
4. implement Discover page first
5. implement Launch and Logs after that

If desired, the next step after this design can be to generate:

- folder structure
- initial Electron app scaffold
- typed IPC contracts
- Zustand store skeleton
- first page layout
