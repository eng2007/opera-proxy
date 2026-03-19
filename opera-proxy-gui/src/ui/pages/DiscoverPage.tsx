import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ActionButton, PageHeader, Panel } from "../components";

const discoverStages = [
  "Preparing command",
  "Querying regions",
  "Measuring proxy speed",
  "Rendering results"
] as const;

export const DiscoverPage = () => {
  const settings = useAppStore((state) => state.settings);
  const discover = useAppStore((state) => state.discover);
  const setDiscover = useAppStore((state) => state.setDiscover);
  const discoverForm = useAppStore((state) => state.discoverForm);
  const setDiscoverForm = useAppStore((state) => state.setDiscoverForm);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [activeStage, setActiveStage] = useState<number>(-1);

  useEffect(() => {
    return window.operaProxyApi.onTaskProgress((payload) => {
      if (payload.task !== "discover") {
        return;
      }

      const stageMap: Record<string, number> = {
        prepare: 0,
        query: 1,
        measure: 2,
        render: 3
      };

      setActiveStage(stageMap[payload.stage] ?? -1);
      setStatusText(payload.message);
    });
  }, []);

  const runDiscover = async () => {
    setLoading(true);
    setErrorText("");
    setStatusText("Starting discover run...");
    setActiveStage(0);
    try {
      const result = await window.operaProxyApi.runDiscover({
        country: discoverForm.country,
        discoverRepeat: discoverForm.repeat,
        estimateProxySpeed: true,
        proxySpeedTestUrl: settings?.defaultSpeedTestUrl ?? "https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js",
        sortBy: discoverForm.sortBy
      });
      setDiscover(result);
      setActiveStage(3);
      setStatusText(`Loaded ${result.rows.length} proxies.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Discover failed.");
      setStatusText("");
      setActiveStage(-1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        description="Generate and inspect proxy rows. Discovery can take time because it may probe many endpoints over the network."
        actions={<ActionButton onClick={() => void runDiscover()}>{loading ? "Running..." : "Run Discover"}</ActionButton>}
      />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Panel title="Controls">
          <div className="space-y-4 text-sm">
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Countries</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={discoverForm.country}
                onChange={(e) => setDiscoverForm({ country: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Discover Repeat</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                type="number"
                min={1}
                value={discoverForm.repeat}
                onChange={(e) => setDiscoverForm({ repeat: Number(e.target.value || 1) })}
              />
            </label>
            <label className="block">
              <span className="mb-2 block font-medium text-slate-800">Sort By</span>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={discoverForm.sortBy}
                onChange={(e) => setDiscoverForm({ sortBy: e.target.value as "speed" | "country" | "ip" })}
              >
                <option value="speed">speed</option>
                <option value="country">country</option>
                <option value="ip">ip</option>
              </select>
            </label>
            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              Discover may iterate multiple countries, repeat API lookups, and measure speed for each proxy before results appear.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</div>
              <div className="space-y-2">
                {discoverStages.map((stage, index) => {
                  const isDone = !loading && activeStage > index;
                  const isActive = loading && activeStage === index;
                  return (
                    <div className="flex items-center gap-3 text-sm" key={stage}>
                      <span
                        className={[
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isDone ? "bg-emerald-100 text-emerald-700" : isActive ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                        ].join(" ")}
                      >
                        {isDone ? "OK" : index + 1}
                      </span>
                      <span className={isActive ? "font-medium text-slate-900" : "text-slate-600"}>{stage}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {statusText ? <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs leading-6 text-teal-900">{statusText}</div> : null}
            {errorText ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs leading-6 text-rose-900">{errorText}</div> : null}
          </div>
        </Panel>

        <Panel title="Results">
          <div className="mb-4 rounded-2xl bg-slate-950 p-4 font-mono text-xs text-emerald-300">
            {discover?.commandPreview ?? "Run Discover to see the generated command preview."}
          </div>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Host</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Speed</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(discover?.rows ?? []).map((row) => (
                  <tr key={`${row.countryCode}-${row.ipAddress}-${row.port}`}>
                    <td className="px-4 py-3">{row.countryCode}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.host}</td>
                    <td className="px-4 py-3">{row.ipAddress}:{row.port}</td>
                    <td className="px-4 py-3">{row.speedMs ?? "n/a"}</td>
                    <td className="px-4 py-3">{row.speedStatus ?? "n/a"}</td>
                  </tr>
                ))}
                {discover?.rows?.length ? null : (
                  <tr>
                    <td className="px-4 py-6 text-slate-500" colSpan={5}>
                      No rows loaded yet. Run Discover and the live CLI result will appear here.
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
