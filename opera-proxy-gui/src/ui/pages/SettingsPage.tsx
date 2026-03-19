import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ActionButton, PageHeader, Panel } from "../components";

export const SettingsPage = () => {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const settingsDraft = useAppStore((state) => state.settingsDraft);
  const setSettingsDraft = useAppStore((state) => state.setSettingsDraft);
  const [form, setForm] = useState(settingsDraft ?? settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!settings && !settingsDraft) {
      setForm(undefined);
      return;
    }

    setForm({
      ...(settings ?? {}),
      ...(settingsDraft ?? {})
    } as typeof settings);
  }, [settings, settingsDraft]);

  const save = async () => {
    if (!form) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const next = await window.operaProxyApi.saveSettings(form);
      setSettings(next);
      setSettingsDraft(next);
      setForm(next);
      setMessage("Settings saved.");
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaults = async () => {
    const defaults = await window.operaProxyApi.getDefaultSettings();
    const next = await window.operaProxyApi.saveSettings(defaults);
    setSettings(next);
    setSettingsDraft(next);
    setForm(next);
    setMessage("Default settings restored.");
  };

  const updateField = <K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) => {
    if (!form) {
      return;
    }
    const next = { ...form, [key]: value };
    setForm(next);
    setSettingsDraft(next);
  };

  const browseBinary = async () => {
    const next = await window.operaProxyApi.pickFile({
      title: "Select opera-proxy binary",
      filters: [{ name: "Executable", extensions: ["exe"] }]
    });
    if (next) {
      updateField("binaryPath", next);
    }
  };

  const browseCsv = async () => {
    const next = await window.operaProxyApi.pickCsvFile();
    if (next) {
      updateField("defaultCsvPath", next);
    }
  };

  const browseLogsDir = async () => {
    const next = await window.operaProxyApi.pickDirectory("Select logs directory");
    if (next) {
      updateField("logsDir", next);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Persist the paths and defaults that the GUI uses to orchestrate the existing CLI and helper scripts."
        actions={
          <>
            <ActionButton tone="neutral" onClick={() => void restoreDefaults()}>Restore Defaults</ActionButton>
            <ActionButton onClick={() => void save()}>{saving ? "Saving..." : "Save Settings"}</ActionButton>
          </>
        }
      />

      <Panel title="Runtime Defaults">
        {form ? (
          <div className="space-y-5">
            {message ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <span className="block font-medium text-slate-800">Binary Path</span>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={form.binaryPath}
                    onChange={(e) => updateField("binaryPath", e.target.value)}
                  />
                  <ActionButton tone="neutral" onClick={() => void browseBinary()}>Browse</ActionButton>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <span className="block font-medium text-slate-800">Default CSV</span>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={form.defaultCsvPath}
                    onChange={(e) => updateField("defaultCsvPath", e.target.value)}
                  />
                  <ActionButton tone="neutral" onClick={() => void browseCsv()}>Browse</ActionButton>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <span className="block font-medium text-slate-800">Logs Directory</span>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={form.logsDir}
                    onChange={(e) => updateField("logsDir", e.target.value)}
                  />
                  <ActionButton tone="neutral" onClick={() => void browseLogsDir()}>Browse</ActionButton>
                </div>
              </div>
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-slate-800">Default Country</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={form.defaultCountry}
                  onChange={(e) => updateField("defaultCountry", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-slate-800">Default Start Port</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.defaultStartPort}
                  onChange={(e) => updateField("defaultStartPort", Number(e.target.value || 8080))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-slate-800">Default Sort By</span>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={form.defaultSortBy}
                  onChange={(e) => updateField("defaultSortBy", e.target.value as typeof form.defaultSortBy)}
                >
                  <option value="speed">speed</option>
                  <option value="country">country</option>
                  <option value="ip">ip</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-slate-800">Retain Last N Runs</span>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  type="number"
                  min={0}
                  value={form.maxRetainedRuns}
                  onChange={(e) => updateField("maxRetainedRuns", Number(e.target.value || 0))}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-slate-800">Speed Test URL</span>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={form.defaultSpeedTestUrl}
                onChange={(e) => updateField("defaultSpeedTestUrl", e.target.value)}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              <ActionButton tone="neutral" onClick={() => void window.operaProxyApi.showItem(form.binaryPath)}>Reveal Binary</ActionButton>
              <ActionButton tone="neutral" onClick={() => void window.operaProxyApi.showItem(form.defaultCsvPath)}>Reveal CSV</ActionButton>
              <ActionButton tone="neutral" onClick={() => void window.operaProxyApi.openPath(form.logsDir)}>Open Logs Folder</ActionButton>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              `Retain Last N Runs` controls automatic log rotation after every launch. Set it to `0` to keep all historical runs.
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">Loading settings...</div>
        )}
      </Panel>
    </div>
  );
};
