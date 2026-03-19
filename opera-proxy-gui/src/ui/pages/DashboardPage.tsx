import { useEffect, useState } from "react";
import type { ProxyProcessStatus, RunSummary } from "../../../electron/main/types";
import { useAppStore } from "@/store/useAppStore";
import { ActionButton, MetricCard, PageHeader, Panel } from "../components";

export const DashboardPage = () => {
  const settings = useAppStore((state) => state.settings);
  const discover = useAppStore((state) => state.discover);
  const launchRecords = useAppStore((state) => state.launchRecords);
  const setPage = useAppStore((state) => state.setPage);
  const setActiveRunId = useAppStore((state) => state.setActiveRunId);
  const setLaunchRecords = useAppStore((state) => state.setLaunchRecords);
  const [latestRun, setLatestRun] = useState<RunSummary>();
  const [runCount, setRunCount] = useState(0);
  const [statuses, setStatuses] = useState<ProxyProcessStatus[]>([]);
  const [stopping, setStopping] = useState(false);
  const portByPid = new Map(
    launchRecords.map((record) => {
      const port = record.localProxy.split(":").at(-1) ?? "n/a";
      return [record.pid, port];
    })
  );

  const refreshSummary = async () => {
    const runs = await window.operaProxyApi.getRuns();
    setLatestRun(runs[0]);
    setRunCount(runs.length);
  };

  useEffect(() => {
    void refreshSummary();
  }, [launchRecords.length]);

  useEffect(() => {
    const refresh = async () => {
      setStatuses(await window.operaProxyApi.getProxyStatuses());
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  const openLatestLogs = () => {
    if (!latestRun) {
      return;
    }
    setActiveRunId(latestRun.id);
    setPage("logs");
  };

  const stopAll = async () => {
    setStopping(true);
    try {
      await window.operaProxyApi.stopAll();
      setLaunchRecords([]);
      setStatuses([]);
    } finally {
      setStopping(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm("Delete all stored log runs?")) {
      return;
    }

    const result = await window.operaProxyApi.clearLogs();
    setActiveRunId(undefined);
    await refreshSummary();
    if (result.busyRuns > 0) {
      window.alert(`Deleted ${result.deletedRuns} run(s). Skipped ${result.busyRuns} busy run(s) that are still locked by running processes.`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="High-level overview of discovery data, launch state, and the local asset paths the GUI orchestrates."
        actions={
          <>
            <ActionButton tone="neutral" onClick={() => setPage("discover")}>Discover</ActionButton>
            <ActionButton tone="neutral" onClick={() => setPage("launch")}>Launch</ActionButton>
            <ActionButton tone="neutral" onClick={() => void stopAll()}>{stopping ? "Stopping..." : "Stop All"}</ActionButton>
            <ActionButton onClick={() => void refreshSummary()}>Refresh Summary</ActionButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Running Proxies" value={String(statuses.length)} hint="Live process count from the current opera-proxy binary." />
        <MetricCard label="Discovered Rows" value={String(discover?.rows.length ?? 0)} hint="Rows currently loaded into the discover workspace." />
        <MetricCard label="Latest Run" value={latestRun?.id ?? "none"} hint="Most recent directory found under proxy-runs." />
        <MetricCard
          label="Stored Runs"
          value={String(runCount)}
          hint={settings ? `Rotation keeps ${settings.maxRetainedRuns === 0 ? "all runs" : `last ${settings.maxRetainedRuns} run(s)`}.` : "Loading rotation policy..."}
        />
      </div>

      <Panel title="Live Process Snapshot">
        <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">PID</th>
                <th className="px-4 py-3">Port</th>
                <th className="px-4 py-3">Process</th>
                <th className="px-4 py-3">Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {statuses.map((status) => (
                <tr key={status.pid}>
                  <td className="px-4 py-3">{status.pid}</td>
                  <td className="px-4 py-3">{portByPid.get(status.pid) ?? "n/a"}</td>
                  <td className="px-4 py-3">{status.name}</td>
                  <td className="px-4 py-3 break-all text-xs text-slate-500">{status.path ?? "n/a"}</td>
                </tr>
              ))}
              {statuses.length ? null : (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={4}>
                    No live opera-proxy processes found for the configured binary.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-6">
          <Panel title="Latest Run" accent="bg-warn">
            {latestRun ? (
              <div className="space-y-4 text-sm text-slate-700">
                <div>
                  <div className="font-semibold text-slate-900">Run ID</div>
                  <div className="mt-1">{latestRun.id}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Log Files</div>
                  <div className="mt-1">{latestRun.fileCount}</div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Logs Directory</div>
                  <div className="mt-1 break-all text-xs text-slate-500">{latestRun.logsDir}</div>
                </div>
                <div className="flex gap-3">
                  <ActionButton onClick={openLatestLogs}>Open Logs</ActionButton>
                  <ActionButton tone="neutral" onClick={() => void window.operaProxyApi.showItem(latestRun.logsDir)}>
                    Reveal Folder
                  </ActionButton>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No run directories found yet.</div>
            )}
          </Panel>

          <Panel title="Storage" accent="bg-danger">
            <div className="space-y-4 text-sm text-slate-700">
              <div>
                <div className="font-semibold text-slate-900">Current Stored Runs</div>
                <div className="mt-1">{runCount}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Rotation Policy</div>
                <div className="mt-1">
                  {settings ? (settings.maxRetainedRuns === 0 ? "Keep all runs" : `Keep last ${settings.maxRetainedRuns} run(s)`) : "Loading..."}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Next Launch Outcome</div>
                <div className="mt-1">
                  {settings
                    ? settings.maxRetainedRuns === 0
                      ? "No automatic deletion will happen."
                      : `After the next launch, at most ${settings.maxRetainedRuns} run folder(s) will remain.`
                  : "Loading..."}
                </div>
              </div>
              <div className="flex gap-3">
                <ActionButton tone="neutral" onClick={() => void clearLogs()}>
                  Clear Logs
                </ActionButton>
                <ActionButton tone="neutral" onClick={() => void refreshSummary()}>
                  Refresh Storage
                </ActionButton>
              </div>
            </div>
          </Panel>
        </div>

        <Panel title="Current Wiring">
          <dl className="grid gap-4 text-sm text-slate-700">
            <div>
              <dt className="font-semibold text-slate-900">Binary Path</dt>
              <dd className="mt-1 break-all">{settings?.binaryPath ?? "Loading..."}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Default CSV</dt>
              <dd className="mt-1 break-all">{settings?.defaultCsvPath ?? "Loading..."}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Logs Directory</dt>
              <dd className="mt-1 break-all">{settings?.logsDir ?? "Loading..."}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
};
