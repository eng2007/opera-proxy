import { useEffect, useState } from "react";
import type { RunSummary } from "../../../electron/main/types";
import { useAppStore } from "@/store/useAppStore";
import { ActionButton, PageHeader, Panel } from "../components";

export const RunsPage = () => {
  const setPage = useAppStore((state) => state.setPage);
  const setActiveRunId = useAppStore((state) => state.setActiveRunId);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshRuns = async () => {
    setLoading(true);
    try {
      setRuns(await window.operaProxyApi.getRuns());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRuns();
  }, []);

  const openLogs = (runId: string) => {
    setActiveRunId(runId);
    setPage("logs");
  };

  const clearLogs = async () => {
    if (!window.confirm("Delete all stored log runs?")) {
      return;
    }

    setLoading(true);
    try {
      const result = await window.operaProxyApi.clearLogs();
      setActiveRunId(undefined);
      await refreshRuns();
      if (result.busyRuns > 0) {
        window.alert(`Deleted ${result.deletedRuns} run(s). Skipped ${result.busyRuns} busy run(s) that are still locked by running processes.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        description="Browse stored launch runs under proxy-runs and jump directly into the corresponding log view."
        actions={
          <>
            <ActionButton tone="neutral" onClick={() => void clearLogs()}>{loading ? "Working..." : "Clear Logs"}</ActionButton>
            <ActionButton onClick={() => void refreshRuns()}>{loading ? "Refreshing..." : "Refresh Runs"}</ActionButton>
          </>
        }
      />

      <Panel title="Run History" accent="bg-warn">
        <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">Run ID</th>
                <th className="px-4 py-3">Log Files</th>
                <th className="px-4 py-3">Logs Directory</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{run.id}</td>
                  <td className="px-4 py-3">{run.fileCount}</td>
                  <td className="px-4 py-3 break-all text-xs text-slate-500">{run.logsDir}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <ActionButton tone="neutral" onClick={() => openLogs(run.id)}>
                        Open Logs
                      </ActionButton>
                      <ActionButton tone="neutral" onClick={() => void window.operaProxyApi.showItem(run.logsDir)}>
                        Reveal
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
              {runs.length ? null : (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={4}>
                    No launch runs found yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};
