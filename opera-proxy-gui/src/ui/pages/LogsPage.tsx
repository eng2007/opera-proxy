import { useEffect, useMemo, useState } from "react";
import type { LogFileSnapshot, RunSummary } from "../../../electron/main/types";
import { useAppStore } from "@/store/useAppStore";
import { ActionButton, PageHeader, Panel } from "../components";

export const LogsPage = () => {
  const storedActiveRunId = useAppStore((state) => state.activeRunId);
  const setActiveRunIdInStore = useAppStore((state) => state.setActiveRunId);
  const stderrOnly = useAppStore((state) => state.logsStderrOnly);
  const setLogsStderrOnly = useAppStore((state) => state.setLogsStderrOnly);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [snapshots, setSnapshots] = useState<LogFileSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [tailError, setTailError] = useState("");

  const refreshRuns = async () => {
    const nextRuns = await window.operaProxyApi.getRuns();
    setRuns(nextRuns);
    setActiveRunId((current) => current || storedActiveRunId || nextRuns[0]?.id || "");
  };

  const refreshSnapshots = async (runId: string) => {
    if (!runId) {
      setSnapshots([]);
      setTailError("");
      return;
    }
    setLoading(true);
    try {
      const nextSnapshots = await window.operaProxyApi.getLogSnapshots(runId, 60);
      setSnapshots(nextSnapshots);
      setTailError("");
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm("Delete all stored log runs?")) {
      return;
    }

    const result = await window.operaProxyApi.clearLogs();
    setSnapshots([]);
    setTailError("");
    setActiveRunId("");
    setActiveRunIdInStore(undefined);
    await refreshRuns();
    if (result.busyRuns > 0) {
      setTailError(`Deleted ${result.deletedRuns} run(s). Skipped ${result.busyRuns} busy run(s) that are still locked by running processes.`);
    }
  };

  useEffect(() => {
    void refreshRuns();
  }, [storedActiveRunId]);

  useEffect(() => {
    if (activeRunId) {
      setActiveRunIdInStore(activeRunId);
    }
  }, [activeRunId, setActiveRunIdInStore]);

  useEffect(() => {
    if (!activeRunId) {
      setSnapshots([]);
      setTailError("");
      return;
    }

    let active = true;
    let currentSessionId = "";

    setLoading(true);
    setTailError("");

    const unsubscribe = window.operaProxyApi.onLogTailData((payload) => {
      if (!active || payload.runId !== activeRunId || payload.sessionId !== currentSessionId) {
        return;
      }

      setSnapshots(payload.snapshots);
      setTailError(payload.error ?? "");
      setLoading(false);
    });

    void window.operaProxyApi.startLogTail(activeRunId, 60).then((sessionId) => {
      if (!active) {
        void window.operaProxyApi.stopLogTail(sessionId);
        return;
      }

      currentSessionId = sessionId;
    }).catch((error) => {
      if (!active) {
        return;
      }

      setTailError(error instanceof Error ? error.message : "Unable to start log tail.");
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
      if (currentSessionId) {
        void window.operaProxyApi.stopLogTail(currentSessionId);
      }
    };
  }, [activeRunId]);

  const visibleSnapshots = useMemo(
    () => snapshots.filter((snapshot) => (stderrOnly ? snapshot.name.includes("stderr") : true)),
    [snapshots, stderrOnly]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs"
        description="Inspect launch runs stored in proxy-runs. This page now reads the real run directories and refreshes log snapshots automatically."
        actions={
          <>
            <ActionButton tone="neutral" onClick={() => void clearLogs()}>Clear Logs</ActionButton>
            <ActionButton tone="neutral" onClick={() => void refreshRuns()}>Refresh Runs</ActionButton>
            <ActionButton onClick={() => void refreshSnapshots(activeRunId)}>{loading ? "Streaming..." : "Refresh Logs"}</ActionButton>
            {activeRunId ? (
              <ActionButton tone="neutral" onClick={() => void window.operaProxyApi.showItem(visibleSnapshots[0]?.path ?? "")}>
                Reveal Log File
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Panel title="Run Selector">
          <div className="space-y-4 text-sm">
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Active Run</span>
              <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={activeRunId} onChange={(e) => setActiveRunId(e.target.value)}>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id} ({run.fileCount} files)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <input type="checkbox" checked={stderrOnly} onChange={(e) => setLogsStderrOnly(e.target.checked)} />
              <span>Show only stderr logs</span>
            </label>
            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              The viewer now keeps a live tail session from Electron main and refreshes snapshots centrally about once per second.
            </div>
          </div>
        </Panel>

        <Panel title="Log Snapshots" accent="bg-danger">
          <div className="mb-4 text-sm text-slate-600">
            Showing {visibleSnapshots.length} file(s) from run <span className="font-semibold text-slate-900">{activeRunId || "n/a"}</span>
          </div>
          {tailError ? (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {tailError}
            </div>
          ) : null}
          <div className="space-y-4">
            {visibleSnapshots.map((snapshot) => (
              <div key={snapshot.path} className="overflow-hidden rounded-[24px] ring-1 ring-slate-200">
                <div className="bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                  <div className="flex items-center justify-between gap-4">
                    <span>{snapshot.name}</span>
                    <button className="rounded-lg bg-white px-2 py-1 text-[10px] tracking-normal text-slate-700 ring-1 ring-slate-300" onClick={() => void window.operaProxyApi.showItem(snapshot.path)}>
                      Reveal
                    </button>
                  </div>
                </div>
                <pre className="max-h-[320px] overflow-auto bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
                  {snapshot.content || "[empty log]"}
                </pre>
              </div>
            ))}
            {visibleSnapshots.length ? null : (
              <div className="rounded-[24px] bg-slate-950 p-5 font-mono text-sm leading-7 text-slate-100">
                No log snapshots available for the current selection.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
};
