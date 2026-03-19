import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { getDefaultSettings, loadSettings, saveSettings } from "./settings";
import { clearLogRuns, discoverProxies, getProxyStatuses, getRunLogSnapshots, getRunSummaries, launchFromCsv, stopAllProxies } from "./proxy-service";
import type { DiscoverInput, LaunchInput } from "./types";

type LogTailSession = {
  timer: NodeJS.Timeout;
  window: BrowserWindow;
};

const logTailSessions = new Map<string, LogTailSession>();

const stopLogTailSession = (sessionId: string) => {
  const session = logTailSessions.get(sessionId);
  if (!session) {
    return;
  }

  clearInterval(session.timer);
  logTailSessions.delete(sessionId);
};

const stopLogTailSessionsForWindow = (window: BrowserWindow) => {
  for (const [sessionId, session] of logTailSessions.entries()) {
    if (session.window === window) {
      stopLogTailSession(sessionId);
    }
  }
};

const pushTaskProgress = (window: BrowserWindow, task: "discover" | "launch", stage: string, message: string) => {
  if (!window.isDestroyed()) {
    window.webContents.send("task:progress", { task, stage, message });
  }
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    title: "opera-proxy GUI",
    backgroundColor: "#f3f5f7",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(__dirname, "../../dist/index.html"));
  }

  window.on("closed", () => {
    stopLogTailSessionsForWindow(window);
  });
};

app.whenReady().then(() => {
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", (_event, patch) => saveSettings(patch));
  ipcMain.handle("settings:defaults", () => getDefaultSettings());
  ipcMain.handle("discover:run", async (event, input: DiscoverInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return discoverProxies(input, loadSettings(), (stage, message) => {
      if (window) {
        pushTaskProgress(window, "discover", stage, message);
      }
    });
  });
  ipcMain.handle("launch:run", async (event, input: LaunchInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return launchFromCsv(input, loadSettings(), (stage, message) => {
      if (window) {
        pushTaskProgress(window, "launch", stage, message);
      }
    });
  });
  ipcMain.handle("launch:stopAll", () => stopAllProxies(loadSettings()));
  ipcMain.handle("launch:status", (_event, pids?: number[]) => getProxyStatuses(loadSettings(), pids));
  ipcMain.handle("logs:runs", () => getRunSummaries(loadSettings()));
  ipcMain.handle("logs:snapshots", (_event, runId: string, tailLines?: number) => getRunLogSnapshots(loadSettings(), runId, tailLines));
  ipcMain.handle("logs:clear", () => clearLogRuns(loadSettings()));
  ipcMain.handle("logs:tailStart", async (event, runId: string, tailLines = 60) => {
    const window = BrowserWindow.fromWebContents(event.sender);
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
    }, 1000);

    logTailSessions.set(sessionId, { timer, window });
    return sessionId;
  });
  ipcMain.handle("logs:tailStop", (_event, sessionId: string) => {
    stopLogTailSession(sessionId);
    return true;
  });
  ipcMain.handle("files:openPath", async (_event, targetPath: string) => shell.openPath(targetPath));
  ipcMain.handle("files:showItem", async (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
    return true;
  });
  ipcMain.handle("dialog:openCsv", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("dialog:openFile", async (_event, options?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title,
      properties: ["openFile"],
      filters: options?.filters
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("dialog:openDirectory", async (_event, title?: string) => {
    const result = await dialog.showOpenDialog({
      title,
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  for (const sessionId of logTailSessions.keys()) {
    stopLogTailSession(sessionId);
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
