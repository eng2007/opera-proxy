import { useAppStore } from "@/store/useAppStore";

const items = [
  ["dashboard", "Dashboard"],
  ["discover", "Discover"],
  ["launch", "Launch"],
  ["runs", "Runs"],
  ["logs", "Logs"],
  ["settings", "Settings"]
] as const;

export const Sidebar = () => {
  const page = useAppStore((state) => state.page);
  const setPage = useAppStore((state) => state.setPage);

  return (
    <aside className="border-r border-slate-200 bg-panel/80 px-5 py-6 shadow-panel backdrop-blur">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.32em] text-slate-500">opera-proxy</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Control Room</h1>
        <p className="mt-2 text-sm text-slate-600">
          Desktop shell for discovery, launch orchestration, and log inspection.
        </p>
      </div>

      <nav className="space-y-2">
        {items.map(([key, label]) => {
          const active = page === key;
          return (
            <button
              key={key}
              className={[
                "w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition",
                active ? "bg-accent text-white shadow-lg shadow-teal-900/15" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              ].join(" ")}
              onClick={() => setPage(key)}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
