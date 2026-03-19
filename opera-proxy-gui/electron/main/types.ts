export type ProxyRow = {
  countryCode: string;
  countryName: string;
  host: string;
  ipAddress: string;
  port: number;
  speedMs?: number;
  speedStatus?: string;
};

export type DiscoverInput = {
  country: string;
  discoverRepeat: number;
  estimateProxySpeed: boolean;
  proxySpeedTestUrl: string;
  sortBy: "speed" | "country" | "ip";
};

export type DiscoverResult = {
  rows: ProxyRow[];
  commandPreview: string;
  csvPath?: string;
};

export type LaunchInput = {
  csvPath: string;
  startPort: number;
  onlyOkSpeed: boolean;
  maxSpeedMs?: number;
  sortBy: "speed" | "country" | "ip";
  noStopExisting: boolean;
  showWindows: boolean;
};

export type LaunchRecord = {
  pid: number;
  countryCode: string;
  localProxy: string;
  remoteProxy: string;
  speedMs?: number;
  speedStatus?: string;
  stdoutLog?: string;
  stderrLog?: string;
};

export type AppSettings = {
  binaryPath: string;
  defaultCsvPath: string;
  logsDir: string;
  defaultCountry: string;
  defaultStartPort: number;
  defaultSortBy: "speed" | "country" | "ip";
  defaultSpeedTestUrl: string;
  maxRetainedRuns: number;
};

export type RunSummary = {
  id: string;
  logsDir: string;
  fileCount: number;
};

export type LogFileSnapshot = {
  name: string;
  path: string;
  content: string;
};

export type ProxyProcessStatus = {
  pid: number;
  name: string;
  path?: string;
};
