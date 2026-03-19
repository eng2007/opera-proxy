import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, DiscoverInput, DiscoverResult, LaunchInput, LaunchRecord, LogFileSnapshot, ProxyProcessStatus, RunSummary } from "../main/types";

export type LogTailPayload = {
  sessionId: string;
  runId: string;
  snapshots: LogFileSnapshot[];
  error?: string;
};

export type TaskProgressPayload = {
  task: "discover" | "launch";
  stage: string;
  message: string;
};

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  getDefaultSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:defaults"),
  saveSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke("settings:save", patch),
  runDiscover: (input: DiscoverInput): Promise<DiscoverResult> => ipcRenderer.invoke("discover:run", input),
  runLaunch: (input: LaunchInput): Promise<LaunchRecord[]> => ipcRenderer.invoke("launch:run", input),
  stopAll: (): Promise<{ binary: string; stopped: boolean }> => ipcRenderer.invoke("launch:stopAll"),
  getProxyStatuses: (pids?: number[]): Promise<ProxyProcessStatus[]> => ipcRenderer.invoke("launch:status", pids),
  getRuns: (): Promise<RunSummary[]> => ipcRenderer.invoke("logs:runs"),
  getLogSnapshots: (runId: string, tailLines = 40): Promise<LogFileSnapshot[]> => ipcRenderer.invoke("logs:snapshots", runId, tailLines),
  clearLogs: (): Promise<{ deletedRuns: number; busyRuns: number; skippedRuns: string[] }> => ipcRenderer.invoke("logs:clear"),
  startLogTail: (runId: string, tailLines = 60): Promise<string> => ipcRenderer.invoke("logs:tailStart", runId, tailLines),
  stopLogTail: (sessionId: string): Promise<boolean> => ipcRenderer.invoke("logs:tailStop", sessionId),
  onLogTailData: (listener: (payload: LogTailPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: LogTailPayload) => {
      listener(payload);
    };

    ipcRenderer.on("logs:tailData", wrappedListener);
    return () => {
      ipcRenderer.removeListener("logs:tailData", wrappedListener);
    };
  },
  onTaskProgress: (listener: (payload: TaskProgressPayload) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: TaskProgressPayload) => {
      listener(payload);
    };

    ipcRenderer.on("task:progress", wrappedListener);
    return () => {
      ipcRenderer.removeListener("task:progress", wrappedListener);
    };
  },
  openPath: (targetPath: string): Promise<string> => ipcRenderer.invoke("files:openPath", targetPath),
  showItem: (targetPath: string): Promise<boolean> => ipcRenderer.invoke("files:showItem", targetPath),
  pickCsvFile: (): Promise<string | undefined> => ipcRenderer.invoke("dialog:openCsv"),
  pickFile: (options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | undefined> =>
    ipcRenderer.invoke("dialog:openFile", options),
  pickDirectory: (title?: string): Promise<string | undefined> => ipcRenderer.invoke("dialog:openDirectory", title)
};

contextBridge.exposeInMainWorld("operaProxyApi", api);

export type OperaProxyApi = typeof api;
