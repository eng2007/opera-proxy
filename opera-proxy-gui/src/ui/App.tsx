import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Sidebar } from "./Sidebar";
import { DashboardPage } from "./pages/DashboardPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { LaunchPage } from "./pages/LaunchPage";
import { RunsPage } from "./pages/RunsPage";
import { LogsPage } from "./pages/LogsPage";
import { SettingsPage } from "./pages/SettingsPage";

const pageMap = {
  dashboard: DashboardPage,
  discover: DiscoverPage,
  launch: LaunchPage,
  runs: RunsPage,
  logs: LogsPage,
  settings: SettingsPage
} as const;

export const App = () => {
  const page = useAppStore((state) => state.page);
  const setSettings = useAppStore((state) => state.setSettings);
  const ActivePage = pageMap[page];

  useEffect(() => {
    void window.operaProxyApi.getSettings().then(setSettings);
  }, [setSettings]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.18),_transparent_35%),linear-gradient(180deg,#f7fafc_0%,#edf2f7_100%)] text-ink">
      <div className="grid min-h-screen grid-cols-[260px_1fr]">
        <Sidebar />
        <main className="p-6">
          <ActivePage />
        </main>
      </div>
    </div>
  );
};
