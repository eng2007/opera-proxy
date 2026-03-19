"use strict";
const electron = require("electron");
const api = {
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  getDefaultSettings: () => electron.ipcRenderer.invoke("settings:defaults"),
  saveSettings: (patch) => electron.ipcRenderer.invoke("settings:save", patch),
  runDiscover: (input) => electron.ipcRenderer.invoke("discover:run", input),
  runLaunch: (input) => electron.ipcRenderer.invoke("launch:run", input),
  stopAll: () => electron.ipcRenderer.invoke("launch:stopAll"),
  getProxyStatuses: (pids) => electron.ipcRenderer.invoke("launch:status", pids),
  getRuns: () => electron.ipcRenderer.invoke("logs:runs"),
  getLogSnapshots: (runId, tailLines = 40) => electron.ipcRenderer.invoke("logs:snapshots", runId, tailLines),
  clearLogs: () => electron.ipcRenderer.invoke("logs:clear"),
  startLogTail: (runId, tailLines = 60) => electron.ipcRenderer.invoke("logs:tailStart", runId, tailLines),
  stopLogTail: (sessionId) => electron.ipcRenderer.invoke("logs:tailStop", sessionId),
  onLogTailData: (listener) => {
    const wrappedListener = (_event, payload) => {
      listener(payload);
    };
    electron.ipcRenderer.on("logs:tailData", wrappedListener);
    return () => {
      electron.ipcRenderer.removeListener("logs:tailData", wrappedListener);
    };
  },
  onTaskProgress: (listener) => {
    const wrappedListener = (_event, payload) => {
      listener(payload);
    };
    electron.ipcRenderer.on("task:progress", wrappedListener);
    return () => {
      electron.ipcRenderer.removeListener("task:progress", wrappedListener);
    };
  },
  openPath: (targetPath) => electron.ipcRenderer.invoke("files:openPath", targetPath),
  showItem: (targetPath) => electron.ipcRenderer.invoke("files:showItem", targetPath),
  pickCsvFile: () => electron.ipcRenderer.invoke("dialog:openCsv"),
  pickFile: (options) => electron.ipcRenderer.invoke("dialog:openFile", options),
  pickDirectory: (title) => electron.ipcRenderer.invoke("dialog:openDirectory", title)
};
electron.contextBridge.exposeInMainWorld("operaProxyApi", api);
