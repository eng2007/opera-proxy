# GUI Setup

This repository now includes an initial Electron + React + TypeScript scaffold for a desktop GUI around the existing `opera-proxy` binary and helper scripts.

## Included

- Electron main process scaffold
- secure preload bridge
- React 18 renderer with Tailwind CSS
- Zustand app store
- first pages:
  - Dashboard
  - Discover
  - Launch
  - Logs
  - Settings

## Files To Start With

- `package.json`
- `electron.vite.config.ts`
- `electron/main/index.ts`
- `electron/preload/index.ts`
- `src/ui/App.tsx`
- `src/store/useAppStore.ts`

The Electron entry points are explicitly configured in:

- `electron.vite.config.ts`

using:

- `electron/main/index.ts`
- `electron/preload/index.ts`

## Install

```powershell
npm install
```

## Run In Development

```powershell
npm run dev
```

## Build

```powershell
npm run build
```

## Package

```powershell
npm run dist
```

## Current Scope

This is a working scaffold, not a fully wired production GUI yet.

Today it provides:

- project structure
- typed IPC contracts
- placeholder service layer in Electron main
- renderer pages ready for real data integration

The next implementation step is replacing placeholder discover and launch responses in:

- `electron/main/proxy-service.ts`

with real process execution and structured parsing of:

- `bin\opera-proxy.windows-x64.exe`
- `run-proxies-from-csv.ps1`
- `stop-opera-proxies.ps1`
- `tail-proxy-logs.ps1`
