import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppSettings } from "./types";

const projectRoot = () => join(process.cwd(), "..");
const packagedResourcesRoot = () => process.resourcesPath;

export const getDefaultSettings = (): AppSettings => {
  const baseDir = app.isPackaged ? packagedResourcesRoot() : projectRoot();
  const dataDir = app.getPath("userData");

  return {
    binaryPath: join(baseDir, "bin", "opera-proxy.windows-x64.exe"),
    defaultCsvPath: app.isPackaged ? join(dataDir, "proxies.csv") : join(projectRoot(), "proxies.csv"),
    logsDir: app.isPackaged ? join(dataDir, "proxy-runs") : join(projectRoot(), "proxy-runs"),
    defaultCountry: "ALL",
    defaultStartPort: 8080,
    defaultSortBy: "speed",
    defaultSpeedTestUrl: "https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js",
    maxRetainedRuns: 20
  };
};

const settingsPath = () => {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
};

export const loadSettings = (): AppSettings => {
  const path = settingsPath();
  if (!existsSync(path)) {
    return getDefaultSettings();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AppSettings>;
    return { ...getDefaultSettings(), ...parsed };
  } catch {
    return getDefaultSettings();
  }
};

export const saveSettings = (patch: Partial<AppSettings>): AppSettings => {
  const next = { ...loadSettings(), ...patch };
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
};
