import { app } from "electron";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { AppSettings, DiscoverInput, DiscoverResult, LaunchInput, LaunchRecord, LogFileSnapshot, ProxyProcessStatus, ProxyRow, RunSummary } from "./types";

const execFileAsync = promisify(execFile);
const projectRoot = () => join(process.cwd(), "..");
const resourcesRoot = () => (app.isPackaged ? process.resourcesPath : projectRoot());
const powershellExe = "powershell.exe";

type ProgressReporter = (stage: string, message: string) => void;

const toPowerShellStringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
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

const parseCsvRows = (csvPath: string): ProxyRow[] => {
  if (!existsSync(csvPath)) {
    return [];
  }

  const lines = readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const get = (name: string) => cells[headers.indexOf(name)] ?? "";
    const speedRaw = get("speed_ms");

    return {
      countryCode: get("country_code"),
      countryName: get("country_name"),
      host: get("host"),
      ipAddress: get("ip_address"),
      port: Number(get("port") || 0),
      speedMs: speedRaw ? Number(speedRaw) : undefined,
      speedStatus: get("speed_status") || undefined
    };
  });
};

const sortProxyRows = (rows: ProxyRow[], sortBy: LaunchInput["sortBy"] | DiscoverInput["sortBy"]) => {
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
    return (
      leftRank - rightRank ||
      (left.speedMs ?? Number.MAX_SAFE_INTEGER) - (right.speedMs ?? Number.MAX_SAFE_INTEGER) ||
      left.countryCode.localeCompare(right.countryCode) ||
      left.ipAddress.localeCompare(right.ipAddress) ||
      left.port - right.port
    );
  });

  return nextRows;
};

const resolveBundledPath = (...parts: string[]) => join(resourcesRoot(), ...parts);

const resolveScriptPath = (name: string) => {
  const packagedPath = resolveBundledPath("scripts", name);
  if (existsSync(packagedPath)) {
    return packagedPath;
  }

  const devPath = join(projectRoot(), name);
  if (existsSync(devPath)) {
    return devPath;
  }

  return packagedPath;
};

const getRunDirectories = (logsDir: string) => {
  if (!existsSync(logsDir)) {
    return [];
  }

  return readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      fullPath: join(logsDir, entry.name),
      mtime: statSync(join(logsDir, entry.name)).mtimeMs
    }))
    .sort((left, right) => right.mtime - left.mtime || right.name.localeCompare(left.name));
};

const rotateLogRuns = (logsDir: string, maxRetainedRuns: number, protectedRunDir?: string) => {
  if (maxRetainedRuns <= 0) {
    return 0;
  }

  const runDirs = getRunDirectories(logsDir);
  const toDelete = runDirs.filter((runDir, index) => index >= maxRetainedRuns && runDir.fullPath !== protectedRunDir);

  let deleted = 0;
  for (const runDir of toDelete) {
    try {
      rmSync(runDir.fullPath, { recursive: true, force: true });
      deleted += 1;
    } catch {
      // Skip locked log directories. They are typically still held by running proxy processes.
    }
  }

  return deleted;
};

const buildDiscoverCommand = (input: DiscoverInput, outCsvPath: string, settings: AppSettings) => {
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

  const commandPreview = [`"${settings.binaryPath}"`, ...args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg))].join(" ");
  return { args, commandPreview };
};

export const discoverProxies = async (input: DiscoverInput, settings: AppSettings, onProgress?: ProgressReporter): Promise<DiscoverResult> => {
  if (!existsSync(settings.binaryPath)) {
    throw new Error(`Binary not found: ${settings.binaryPath}`);
  }

  const tmpDir = mkdtempSync(join(app.getPath("temp"), "opera-proxy-gui-discover-"));
  const outCsvPath = join(tmpDir, "discover.csv");
  const { args, commandPreview } = buildDiscoverCommand(input, outCsvPath, settings);

  try {
    onProgress?.("prepare", "Prepared discover command.");
    onProgress?.("query", "Running discover command against the CLI.");
    await execFileAsync(settings.binaryPath, args, {
      cwd: resourcesRoot(),
      windowsHide: true
    });
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr || error.message)
        : error instanceof Error
          ? error.message
          : String(error);
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

export const launchFromCsv = async (input: LaunchInput, settings: AppSettings, onProgress?: ProgressReporter): Promise<LaunchRecord[]> => {
  const binaryPath = settings.binaryPath;
  const logsDir = settings.logsDir;
  if (!existsSync(input.csvPath)) {
    throw new Error(`CSV file not found: ${input.csvPath}`);
  }
  if (!existsSync(binaryPath)) {
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
    rows = rows.filter((row) => row.speedStatus === "ok" && typeof row.speedMs === "number" && row.speedMs <= input.maxSpeedMs!);
    if (!rows.length) {
      throw new Error(`No rows matched MaxSpeedMs <= ${input.maxSpeedMs}`);
    }
  }

  rows = sortProxyRows(rows, input.sortBy);

  onProgress?.("spawn", `Starting ${rows.length} proxy process(es).`);
  mkdirSync(logsDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-");
  const runLogsDir = join(logsDir, runId);
  mkdirSync(runLogsDir, { recursive: true });

  const records: LaunchRecord[] = [];
  let currentPort = input.startPort;

  for (const row of rows) {
    if (currentPort > 65535) {
      throw new Error(`Port range exhausted. Last attempted local port: ${currentPort}`);
    }

    const localProxy = `127.0.0.1:${currentPort}`;
    const remoteProxy = `${row.ipAddress}:${row.port}`;
    const stdoutLog = join(runLogsDir, `${row.countryCode.toUpperCase()}-${currentPort}-stdout.log`);
    const stderrLog = join(runLogsDir, `${row.countryCode.toUpperCase()}-${currentPort}-stderr.log`);
    const stdoutFd = openSync(stdoutLog, "a");
    const stderrFd = openSync(stderrLog, "a");

    try {
      const child = spawn(
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
      closeSync(stdoutFd);
      closeSync(stderrFd);
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

export const stopAllProxies = async (settings: AppSettings) => {
  const scriptPath = resolveScriptPath("stop-opera-proxies.ps1");
  if (!existsSync(scriptPath)) {
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
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr || error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Stop script failed: ${message}`);
  }

  const trimmedStdout = stdout.trim();
  if (!trimmedStdout) {
    throw new Error("Stop script returned empty JSON output.");
  }

  const parsed = JSON.parse(trimmedStdout) as { stopped: number };
  return {
    binary: basename(settings.binaryPath),
    stopped: parsed.stopped > 0
  };
};

export const getRunSummaries = async (settings: AppSettings): Promise<RunSummary[]> => {
  return getRunDirectories(settings.logsDir)
    .map((entry) => {
      const fullPath = entry.fullPath;
      const fileCount = readdirSync(fullPath, { withFileTypes: true }).filter((child) => child.isFile()).length;
      return {
        id: entry.name,
        logsDir: fullPath,
        fileCount
      };
    });
};

export const getRunLogSnapshots = async (settings: AppSettings, runId: string, tailLines = 40): Promise<LogFileSnapshot[]> => {
  const targetDir = join(settings.logsDir, runId);
  if (!existsSync(targetDir)) {
    return [];
  }

  return readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const fullPath = join(targetDir, entry.name);
      const lines = readFileSync(fullPath, "utf8")
        .split(/\r?\n/)
        .slice(-tailLines)
        .join("\n");
      return {
        name: entry.name,
        path: fullPath,
        content: lines
      };
    });
};

export const clearLogRuns = async (settings: AppSettings) => {
  const runDirs = getRunDirectories(settings.logsDir);
  const skipped: string[] = [];
  let deletedRuns = 0;

  for (const runDir of runDirs) {
    try {
      rmSync(runDir.fullPath, { recursive: true, force: true });
      deletedRuns += 1;
    } catch {
      skipped.push(runDir.name);
    }
  }

  mkdirSync(settings.logsDir, { recursive: true });

  return {
    deletedRuns,
    skippedRuns: skipped,
    busyRuns: skipped.length
  };
};

export const getProxyStatuses = async (settings: AppSettings, pids?: number[]): Promise<ProxyProcessStatus[]> => {
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
          `$ids = @(${idListLiteral}); ` +
            "$procs = if ($ids.Count -gt 0) { @(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { " +
            "[PSCustomObject]@{ pid = [int]$_.Id; name = $_.ProcessName; path = $_.Path } }) } else { @() }; " +
            "$procs | ConvertTo-Json -Depth 4 -Compress"
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
          `$binaryPath = ${binaryPathLiteral}; ` +
            "$resolved = if (Test-Path $binaryPath) { (Resolve-Path $binaryPath).Path } else { $null }; " +
            "$name = [System.IO.Path]::GetFileNameWithoutExtension($binaryPath); " +
            "$procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { " +
            "[PSCustomObject]@{ pid = [int]$_.Id; name = $_.ProcessName; path = $_.Path } }); " +
            "if ($resolved) { $filtered = @($procs | Where-Object { $_.path -eq $resolved }); if ($filtered.Count -gt 0) { $procs = $filtered } }; " +
            "$procs | ConvertTo-Json -Depth 4 -Compress"
        ],
        {
          cwd: resourcesRoot(),
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024
        }
      ));
    }
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr || error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Status query failed: ${message}`);
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as ProxyProcessStatus | ProxyProcessStatus[];
  return Array.isArray(parsed) ? parsed : [parsed];
};
