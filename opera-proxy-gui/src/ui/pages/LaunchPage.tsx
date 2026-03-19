import { useEffect, useState } from "react";
import type { ProxyProcessStatus } from "../../../electron/main/types";
import { useAppStore } from "@/store/useAppStore";
import { ActionButton, PageHeader, Panel } from "../components";

const launchStages = [
  "Stopping existing processes",
  "Reading and filtering CSV",
  "Starting proxy processes",
  "Refreshing runtime state"
] as const;

export const LaunchPage = () => {
  const settings = useAppStore((state) => state.settings);
  const launchRecords = useAppStore((state) => state.launchRecords);
  const setLaunchRecords = useAppStore((state) => state.setLaunchRecords);
  const launchForm = useAppStore((state) => state.launchForm);
  const setLaunchForm = useAppStore((state) => state.setLaunchForm);
  const [loading, setLoading] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [activeStage, setActiveStage] = useState<number>(-1);
  const [statuses, setStatuses] = useState<ProxyProcessStatus[]>([]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const patch: Partial<typeof launchForm> = {};
    if (!launchForm.csvPath) {
      patch.csvPath = settings.defaultCsvPath;
    }
    if (!launchForm.startPort) {
      patch.startPort = settings.defaultStartPort;
    }
    if (!launchForm.sortBy) {
      patch.sortBy = settings.defaultSortBy;
    }

    if (Object.keys(patch).length > 0) {
      setLaunchForm(patch);
    }
  }, [launchForm.csvPath, launchForm.sortBy, launchForm.startPort, setLaunchForm, settings]);

  useEffect(() => {
    const refresh = async () => {
      const nextPids = launchRecords.map((record) => record.pid).filter((pid) => Number.isFinite(pid) && pid > 0);
      setStatuses(await window.operaProxyApi.getProxyStatuses(nextPids.length ? nextPids : undefined));
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [launchRecords]);

  useEffect(() => {
    return window.operaProxyApi.onTaskProgress((payload) => {
      if (payload.task !== "launch") {
        return;
      }

      const stageMap: Record<string, number> = {
        stop: 0,
        csv: 1,
        spawn: 2,
        status: 3
      };

      setActiveStage(stageMap[payload.stage] ?? -1);
      setStatusText(payload.message);
    });
  }, []);

  const runLaunch = async () => {
    setLoading(true);
    setErrorText("");
    setStatusText("Starting proxy processes from CSV...");
    setActiveStage(launchForm.noStopExisting ? 1 : 0);
    try {
      const records = await window.operaProxyApi.runLaunch({
        csvPath: launchForm.csvPath,
        startPort: launchForm.startPort,
        onlyOkSpeed: launchForm.onlyOkSpeed,
        maxSpeedMs: launchForm.maxSpeedMs ? Number(launchForm.maxSpeedMs) : undefined,
        sortBy: launchForm.sortBy,
        noStopExisting: launchForm.noStopExisting,
        showWindows: false
      });
      setLaunchRecords(records);
      setStatuses(await window.operaProxyApi.getProxyStatuses(records.map((record) => record.pid)));
      setStatusText(`Launched ${records.length} proxy process(es).`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Launch failed.");
      setStatusText("");
      setActiveStage(-1);
    } finally {
      setLoading(false);
    }
  };

  const stopAll = async () => {
    setStopLoading(true);
    setErrorText("");
    setStatusText("Stopping active proxy processes...");
    setActiveStage(0);
    try {
      await window.operaProxyApi.stopAll();
      setLaunchRecords([]);
      setStatuses([]);
      setStatusText("Active proxy processes stopped.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Stop failed.");
      setStatusText("");
    } finally {
      setStopLoading(false);
    }
  };

  const livePids = new Set(statuses.map((status) => status.pid));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch"
        description="Launch proxy processes from CSV and watch their runtime state. Starting a batch may take time while the helper script prepares logs and processes."
        actions={
          <>
            <ActionButton tone="neutral" onClick={() => void stopAll()}>{stopLoading ? "Stopping..." : "Stop All"}</ActionButton>
            <ActionButton onClick={() => void runLaunch()}>{loading ? "Launching..." : "Launch From CSV"}</ActionButton>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Panel title="Launch Source">
          <div className="space-y-4 text-sm">
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">CSV Path</span>
              <div className="flex gap-2">
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={launchForm.csvPath}
                  onChange={(e) => setLaunchForm({ csvPath: e.target.value })}
                />
                <ActionButton
                  tone="neutral"
                  onClick={async () => {
                    const next = await window.operaProxyApi.pickCsvFile();
                    if (next) {
                      setLaunchForm({ csvPath: next });
                    }
                  }}
                >
                  Browse
                </ActionButton>
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Start Port</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                type="number"
                min={1}
                max={65535}
                value={launchForm.startPort}
                onChange={(e) => setLaunchForm({ startPort: Number(e.target.value || 8080) })}
              />
            </label>
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Sort By</span>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={launchForm.sortBy}
                onChange={(e) => setLaunchForm({ sortBy: e.target.value as "speed" | "country" | "ip" })}
              >
                <option value="speed">speed</option>
                <option value="country">country</option>
                <option value="ip">ip</option>
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <input type="checkbox" checked={launchForm.onlyOkSpeed} onChange={(e) => setLaunchForm({ onlyOkSpeed: e.target.checked })} />
              <span>Only launch rows with `speed_status=ok`</span>
            </label>
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Max Speed (ms)</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                type="number"
                min={0}
                placeholder="Optional"
                value={launchForm.maxSpeedMs}
                onChange={(e) => setLaunchForm({ maxSpeedMs: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <input type="checkbox" checked={launchForm.noStopExisting} onChange={(e) => setLaunchForm({ noStopExisting: e.target.checked })} />
              <span>Do not stop existing proxy processes before launch</span>
            </label>
            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              Launch spends time stopping old processes, validating the CSV, and creating one proxy process plus two log files per row.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</div>
              <div className="space-y-2">
                {launchStages.map((stage, index) => {
                  const skipped = launchForm.noStopExisting && index === 0;
                  const isDone = !loading && !stopLoading && activeStage > index;
                  const isActive = (loading || stopLoading) && activeStage === index;
                  return (
                    <div className="flex items-center gap-3 text-sm" key={stage}>
                      <span
                        className={[
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          skipped
                            ? "bg-slate-100 text-slate-400"
                            : isDone
                              ? "bg-emerald-100 text-emerald-700"
                              : isActive
                                ? "bg-teal-100 text-teal-700"
                                : "bg-slate-100 text-slate-500"
                        ].join(" ")}
                      >
                        {skipped ? "-" : isDone ? "OK" : index + 1}
                      </span>
                      <span className={isActive ? "font-medium text-slate-900" : skipped ? "text-slate-400" : "text-slate-600"}>{stage}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {statusText ? <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs leading-6 text-teal-900">{statusText}</div> : null}
            {errorText ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-6 text-rose-900">{errorText}</div> : null}
          </div>
        </Panel>

        <Panel title="Launch Preview">
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">PID</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Local Proxy</th>
                  <th className="px-4 py-3">Remote Proxy</th>
                  <th className="px-4 py-3">Speed</th>
                  <th className="px-4 py-3">Logs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {launchRecords.map((record) => (
                  <tr key={`${record.pid}-${record.localProxy}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${livePids.has(record.pid) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {livePids.has(record.pid) ? "alive" : "stopped"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{record.pid}</td>
                    <td className="px-4 py-3">{record.countryCode}</td>
                    <td className="px-4 py-3">{record.localProxy}</td>
                    <td className="px-4 py-3">{record.remoteProxy}</td>
                    <td className="px-4 py-3">{record.speedMs ?? "n/a"} / {record.speedStatus ?? "n/a"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <div>{record.stdoutLog ?? "n/a"}</div>
                      <div>{record.stderrLog ?? "n/a"}</div>
                    </td>
                  </tr>
                ))}
                {launchRecords.length ? null : (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={7}>
                      No launch records yet. Start a batch and the real script output will appear here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
};
