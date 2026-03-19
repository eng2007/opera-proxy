"use strict";
const electron = require("electron");
const node_path = require("node:path");
const node_fs = require("node:fs");
const node_child_process = require("node:child_process");
const node_util = require("node:util");
const projectRoot$1 = () => node_path.join(process.cwd(), "..");
const packagedResourcesRoot = () => process.resourcesPath;
const getDefaultSettings = () => {
  const baseDir = electron.app.isPackaged ? packagedResourcesRoot() : projectRoot$1();
  const dataDir = electron.app.getPath("userData");
  return {
    binaryPath: node_path.join(baseDir, "bin", "opera-proxy.windows-x64.exe"),
    defaultCsvPath: electron.app.isPackaged ? node_path.join(dataDir, "proxies.csv") : node_path.join(projectRoot$1(), "proxies.csv"),
    logsDir: electron.app.isPackaged ? node_path.join(dataDir, "proxy-runs") : node_path.join(projectRoot$1(), "proxy-runs"),
    defaultCountry: "ALL",
    defaultStartPort: 8080,
    defaultSortBy: "speed",
    defaultSpeedTestUrl: "https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js",
    maxRetainedRuns: 20
  };
};
const settingsPath = () => {
  const dir = electron.app.getPath("userData");
  node_fs.mkdirSync(dir, { recursive: true });
  return node_path.join(dir, "settings.json");
};
const loadSettings = () => {
  const path = settingsPath();
  if (!node_fs.existsSync(path)) {
    return getDefaultSettings();
  }
  try {
    const parsed = JSON.parse(node_fs.readFileSync(path, "utf8"));
    return { ...getDefaultSettings(), ...parsed };
  } catch {
    return getDefaultSettings();
  }
};
const saveSettings = (patch) => {
  const next = { ...loadSettings(), ...patch };
  node_fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
};
const execFileAsync = node_util.promisify(node_child_process.execFile);
const projectRoot = () => node_path.join(process.cwd(), "..");
const resourcesRoot = () => electron.app.isPackaged ? process.resourcesPath : projectRoot();
const powershellExe = "powershell.exe";
const toPowerShellStringLiteral = (value) => `'${value.replace(/'/g, "''")}'`;
const parseCsvLine = (line) => {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
};
const parseCsvRows = (csvPath) => {
  if (!node_fs.existsSync(csvPath)) {
    return [];
  }
  const lines = node_fs.readFileSync(csvPath, "utf8").split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const get = (name) => cells[headers.indexOf(name)] ?? "";
    const speedRaw = get("speed_ms");
    return {
      countryCode: get("country_code"),
      countryName: get("country_name"),
      host: get("host"),
      ipAddress: get("ip_address"),
      port: Number(get("port") || 0),
      speedMs: speedRaw ? Number(speedRaw) : void 0,
      speedStatus: get("speed_status") || void 0
    };
  });
};
const sortProxyRows = (rows, sortBy) => {
  const nextRows = [...rows];
  nextRows.sort((left, right) => {
    if (sortBy === "country") {
      return left.countryCode.localeCompare(right.countryCode) || left.ipAddress.localeCompare(right.ipAddress) || left.port - right.port;
    }
    if (sortBy === "ip") {
      return left.ipAddress.localeCompare(right.ipAddress) || left.port - right.port || left.countryCode.localeCompare(right.countryCode);
    }
    const leftRank = left.speedStatus === "ok" && typeof left.speedMs === "number" ? 0 : 1;
    const rightRank = right.speedStatus === "ok" && typeof right.speedMs === "number" ? 0 : 1;
    return leftRank - rightRank || (left.speedMs ?? Number.MAX_SAFE_INTEGER) - (right.speedMs ?? Number.MAX_SAFE_INTEGER) || left.countryCode.localeCompare(right.countryCode) || left.ipAddress.localeCompare(right.ipAddress) || left.port - right.port;
  });
  return nextRows;
};
const resolveBundledPath = (...parts) => node_path.join(resourcesRoot(), ...parts);
const resolveScriptPath = (name) => {
  const packagedPath = resolveBundledPath("scripts", name);
  if (node_fs.existsSync(packagedPath)) {
    return packagedPath;
  }
  const devPath = node_path.join(projectRoot(), name);
  if (node_fs.existsSync(devPath)) {
    return devPath;
  }
  return packagedPath;
};
const getRunDirectories = (logsDir) => {
  if (!node_fs.existsSync(logsDir)) {
    return [];
  }
  return node_fs.readdirSync(logsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => ({
    name: entry.name,
    fullPath: node_path.join(logsDir, entry.name),
    mtime: node_fs.statSync(node_path.join(logsDir, entry.name)).mtimeMs
  })).sort((left, right) => right.mtime - left.mtime || right.name.localeCompare(left.name));
};
const rotateLogRuns = (logsDir, maxRetainedRuns, protectedRunDir) => {
  if (maxRetainedRuns <= 0) {
    return 0;
  }
  const runDirs = getRunDirectories(logsDir);
  const toDelete = runDirs.filter((runDir, index) => index >= maxRetainedRuns && runDir.fullPath !== protectedRunDir);
  let deleted = 0;
  for (const runDir of toDelete) {
    try {
      node_fs.rmSync(runDir.fullPath, { recursive: true, force: true });
      deleted += 1;
    } catch {
    }
  }
  return deleted;
};
const buildDiscoverCommand = (input, outCsvPath, settings) => {
  const args = [
    "-country",
    input.country,
    "-list-proxies-all-out",
    outCsvPath,
    "-discover-repeat",
    String(input.discoverRepeat),
    "-sort-proxies-by",
    input.sortBy
  ];
  if (input.estimateProxySpeed) {
    args.push("-estimate-proxy-speed");
    args.push("-proxy-speed-test-url", input.proxySpeedTestUrl);
  }
  const commandPreview = [`"${settings.binaryPath}"`, ...args.map((arg) => arg.includes(" ") ? `"${arg}"` : arg)].join(" ");
  return { args, commandPreview };
};
const discoverProxies = async (input, settings, onProgress) => {
  if (!node_fs.existsSync(settings.binaryPath)) {
    throw new Error(`Binary not found: ${settings.binaryPath}`);
  }
  const tmpDir = node_fs.mkdtempSync(node_path.join(electron.app.getPath("temp"), "opera-proxy-gui-discover-"));
  const outCsvPath = node_path.join(tmpDir, "discover.csv");
  const { args, commandPreview } = buildDiscoverCommand(input, outCsvPath, settings);
  try {
    onProgress?.("prepare", "Prepared discover command.");
    onProgress?.("query", "Running discover command against the CLI.");
    await execFileAsync(settings.binaryPath, args, {
      cwd: resourcesRoot(),
      windowsHide: true
    });
  } catch (error) {
    const message = error instanceof Error && "stderr" in error ? String(error.stderr || error.message) : error instanceof Error ? error.message : String(error);
    throw new Error(`Discover command failed: ${message}`);
  }
  onProgress?.("measure", "CLI finished. Parsing CSV results.");
  const rows = parseCsvRows(outCsvPath);
  onProgress?.("render", `Loaded ${rows.length} proxy rows from discovery output.`);
  return {
    rows,
    commandPreview,
    csvPath: outCsvPath
  };
};
const launchFromCsv = async (input, settings, onProgress) => {
  const binaryPath = settings.binaryPath;
  const logsDir = settings.logsDir;
  if (!node_fs.existsSync(input.csvPath)) {
    throw new Error(`CSV file not found: ${input.csvPath}`);
  }
  if (!node_fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}`);
  }
  if (!input.noStopExisting) {
    onProgress?.("stop", "Stopping existing proxy processes.");
    await stopAllProxies(settings);
  }
  onProgress?.("csv", "Reading CSV rows and applying filters.");
  let rows = parseCsvRows(input.csvPath);
  if (!rows.length) {
    throw new Error(`CSV has no data rows: ${input.csvPath}`);
  }
  if (input.onlyOkSpeed) {
    rows = rows.filter((row) => row.speedStatus === "ok");
    if (!rows.length) {
      throw new Error(`No rows with speed_status=ok were found in ${input.csvPath}`);
    }
  }
  if (typeof input.maxSpeedMs === "number") {
    rows = rows.filter((row) => row.speedStatus === "ok" && typeof row.speedMs === "number" && row.speedMs <= input.maxSpeedMs);
    if (!rows.length) {
      throw new Error(`No rows matched MaxSpeedMs <= ${input.maxSpeedMs}`);
    }
  }
  rows = sortProxyRows(rows, input.sortBy);
  onProgress?.("spawn", `Starting ${rows.length} proxy process(es).`);
  node_fs.mkdirSync(logsDir, { recursive: true });
  const runId = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-");
  const runLogsDir = node_path.join(logsDir, runId);
  node_fs.mkdirSync(runLogsDir, { recursive: true });
  const records = [];
  let currentPort = input.startPort;
  for (const row of rows) {
    if (currentPort > 65535) {
      throw new Error(`Port range exhausted. Last attempted local port: ${currentPort}`);
    }
    const localProxy = `127.0.0.1:${currentPort}`;
    const remoteProxy = `${row.ipAddress}:${row.port}`;
    const stdoutLog = node_path.join(runLogsDir, `${row.countryCode.toUpperCase()}-${currentPort}-stdout.log`);
    const stderrLog = node_path.join(runLogsDir, `${row.countryCode.toUpperCase()}-${currentPort}-stderr.log`);
    const stdoutFd = node_fs.openSync(stdoutLog, "a");
    const stderrFd = node_fs.openSync(stderrLog, "a");
    try {
      const child = node_child_process.spawn(
        binaryPath,
        ["-country", row.countryCode.toUpperCase(), "-bind-address", localProxy, "-override-proxy-address", remoteProxy],
        {
          cwd: resourcesRoot(),
          detached: true,
          windowsHide: !input.showWindows,
          stdio: ["ignore", stdoutFd, stderrFd]
        }
      );
      child.unref();
      records.push({
        pid: child.pid ?? 0,
        countryCode: row.countryCode.toUpperCase(),
        localProxy,
        remoteProxy,
        speedMs: row.speedMs,
        speedStatus: row.speedStatus,
        stdoutLog,
        stderrLog
      });
    } finally {
      node_fs.closeSync(stdoutFd);
      node_fs.closeSync(stderrFd);
    }
    currentPort += 1;
  }
  if (!records.length) {
    throw new Error("No proxy processes were launched.");
  }
  const rotated = rotateLogRuns(logsDir, settings.maxRetainedRuns, runLogsDir);
  if (rotated > 0) {
    onProgress?.("status", `Refreshing runtime state and rotating ${rotated} old log run(s).`);
  } else {
    onProgress?.("status", `Refreshing runtime state for ${records.length} launched process(es).`);
  }
  return records;
};
const stopAllProxies = async (settings) => {
  const scriptPath = resolveScriptPath("stop-opera-proxies.ps1");
  if (!node_fs.existsSync(scriptPath)) {
    throw new Error(`Stop script not found: ${scriptPath}`);
  }
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(
      powershellExe,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-BinaryPath",
        settings.binaryPath,
        "-Json"
      ],
      {
        cwd: resourcesRoot(),
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      }
    ));
  } catch (error) {
    const message = error instanceof Error && "stderr" in error ? String(error.stderr || error.message) : error instanceof Error ? error.message : String(error);
    throw new Error(`Stop script failed: ${message}`);
  }
  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error("Stop script returned empty JSON output.");
  }
  const parsed = JSON.parse(trimmedStdout);
  return {
    binary: node_path.basename(settings.binaryPath),
    stopped: parsed.stopped > 0
  };
};
const getRunSummaries = async (settings) => {
  return getRunDirectories(settings.logsDir).map((entry) => {
    const fullPath = entry.fullPath;
    const fileCount = node_fs.readdirSync(fullPath, { withFileTypes: true }).filter((child) => child.isFile()).length;
    return {
      id: entry.name,
      logsDir: fullPath,
      fileCount
    };
  });
};
const getRunLogSnapshots = async (settings, runId, tailLines = 40) => {
  const targetDir = node_path.join(settings.logsDir, runId);
  if (!node_fs.existsSync(targetDir)) {
    return [];
  }
  return node_fs.readdirSync(targetDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".log")).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => {
    const fullPath = node_path.join(targetDir, entry.name);
    const lines = node_fs.readFileSync(fullPath, "utf8").split(/\r?\n/).slice(-tailLines).join("\n");
    return {
      name: entry.name,
      path: fullPath,
      content: lines
    };
  });
};
const clearLogRuns = async (settings) => {
  const runDirs = getRunDirectories(settings.logsDir);
  const skipped = [];
  let deletedRuns = 0;
  for (const runDir of runDirs) {
    try {
      node_fs.rmSync(runDir.fullPath, { recursive: true, force: true });
      deletedRuns += 1;
    } catch {
      skipped.push(runDir.name);
    }
  }
  node_fs.mkdirSync(settings.logsDir, { recursive: true });
  return {
    deletedRuns,
    skippedRuns: skipped,
    busyRuns: skipped.length
  };
};
const getProxyStatuses = async (settings, pids) => {
  const pidList = (pids ?? []).filter((pid) => Number.isFinite(pid) && pid > 0);
  let stdout = "";
  try {
    if (pidList.length) {
      const idListLiteral = pidList.join(", ");
      ({ stdout } = await execFileAsync(
        powershellExe,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `$ids = @(${idListLiteral}); $procs = if ($ids.Count -gt 0) { @(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { [PSCustomObject]@{ pid = [int]$_.Id; name = $_.ProcessName; path = $_.Path } }) } else { @() }; $procs | ConvertTo-Json -Depth 4 -Compress`
        ],
        {
          cwd: resourcesRoot(),
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }
      ));
    } else {
      const binaryPathLiteral = toPowerShellStringLiteral(settings.binaryPath);
      ({ stdout } = await execFileAsync(
        powershellExe,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `$binaryPath = ${binaryPathLiteral}; $resolved = if (Test-Path $binaryPath) { (Resolve-Path $binaryPath).Path } else { $null }; $name = [System.IO.Path]::GetFileNameWithoutExtension($binaryPath); $procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { [PSCustomObject]@{ pid = [int]$_.Id; name = $_.ProcessName; path = $_.Path } }); if ($resolved) { $filtered = @($procs | Where-Object { $_.path -eq $resolved }); if ($filtered.Count -gt 0) { $procs = $filtered } }; $procs | ConvertTo-Json -Depth 4 -Compress`
        ],
        {
          cwd: resourcesRoot(),
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }
      ));
    }
  } catch (error) {
    const message = error instanceof Error && "stderr" in error ? String(error.stderr || error.message) : error instanceof Error ? error.message : String(error);
    throw new Error(`Status query failed: ${message}`);
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
};
const logTailSessions = /* @__PURE__ */ new Map();
const stopLogTailSession = (sessionId) => {
  const session = logTailSessions.get(sessionId);
  if (!session) {
    return;
  }
  clearInterval(session.timer);
  logTailSessions.delete(sessionId);
};
const stopLogTailSessionsForWindow = (window) => {
  for (const [sessionId, session] of logTailSessions.entries()) {
    if (session.window === window) {
      stopLogTailSession(sessionId);
    }
  }
};
const pushTaskProgress = (window, task, stage, message) => {
  if (!window.isDestroyed()) {
    window.webContents.send("task:progress", { task, stage, message });
  }
};
const createWindow = async () => {
  const window = new electron.BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    title: "opera-proxy GUI",
    backgroundColor: "#f3f5f7",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(node_path.join(__dirname, "../../dist/index.html"));
  }
  window.on("closed", () => {
    stopLogTailSessionsForWindow(window);
  });
};
electron.app.whenReady().then(() => {
  electron.ipcMain.handle("settings:get", () => loadSettings());
  electron.ipcMain.handle("settings:save", (_event, patch) => saveSettings(patch));
  electron.ipcMain.handle("settings:defaults", () => getDefaultSettings());
  electron.ipcMain.handle("discover:run", async (event, input) => {
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    return discoverProxies(input, loadSettings(), (stage, message) => {
      if (window) {
        pushTaskProgress(window, "discover", stage, message);
      }
    });
  });
  electron.ipcMain.handle("launch:run", async (event, input) => {
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    return launchFromCsv(input, loadSettings(), (stage, message) => {
      if (window) {
        pushTaskProgress(window, "launch", stage, message);
      }
    });
  });
  electron.ipcMain.handle("launch:stopAll", () => stopAllProxies(loadSettings()));
  electron.ipcMain.handle("launch:status", (_event, pids) => getProxyStatuses(loadSettings(), pids));
  electron.ipcMain.handle("logs:runs", () => getRunSummaries(loadSettings()));
  electron.ipcMain.handle("logs:snapshots", (_event, runId, tailLines) => getRunLogSnapshots(loadSettings(), runId, tailLines));
  electron.ipcMain.handle("logs:clear", () => clearLogRuns(loadSettings()));
  electron.ipcMain.handle("logs:tailStart", async (event, runId, tailLines = 60) => {
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("Unable to resolve renderer window for log tail session.");
    }
    const sessionId = `${window.webContents.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const pushSnapshots = async () => {
      try {
        const snapshots = await getRunLogSnapshots(loadSettings(), runId, tailLines);
        if (!window.isDestroyed()) {
          window.webContents.send("logs:tailData", { sessionId, runId, snapshots });
        }
      } catch (error) {
        if (!window.isDestroyed()) {
          window.webContents.send("logs:tailData", {
            sessionId,
            runId,
            snapshots: [],
            error: error instanceof Error ? error.message : "Unknown log tail error"
          });
        }
      }
    };
    void pushSnapshots();
    const timer = setInterval(() => {
      void pushSnapshots();
    }, 1e3);
    logTailSessions.set(sessionId, { timer, window });
    return sessionId;
  });
  electron.ipcMain.handle("logs:tailStop", (_event, sessionId) => {
    stopLogTailSession(sessionId);
    return true;
  });
  electron.ipcMain.handle("files:openPath", async (_event, targetPath) => electron.shell.openPath(targetPath));
  electron.ipcMain.handle("files:showItem", async (_event, targetPath) => {
    electron.shell.showItemInFolder(targetPath);
    return true;
  });
  electron.ipcMain.handle("dialog:openCsv", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    return result.canceled ? void 0 : result.filePaths[0];
  });
  electron.ipcMain.handle("dialog:openFile", async (_event, options) => {
    const result = await electron.dialog.showOpenDialog({
      title: options?.title,
      properties: ["openFile"],
      filters: options?.filters
    });
    return result.canceled ? void 0 : result.filePaths[0];
  });
  electron.ipcMain.handle("dialog:openDirectory", async (_event, title) => {
    const result = await electron.dialog.showOpenDialog({
      title,
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? void 0 : result.filePaths[0];
  });
  void createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  for (const sessionId of logTailSessions.keys()) {
    stopLogTailSession(sessionId);
  }
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
