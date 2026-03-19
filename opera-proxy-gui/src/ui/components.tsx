import type { ReactNode } from "react";

export const PageHeader = ({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) => (
  <div className="mb-6 flex items-start justify-between gap-4">
    <div>
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
    {actions ? <div className="flex gap-3">{actions}</div> : null}
  </div>
);

export const Panel = ({ title, children, accent }: { title: string; children: ReactNode; accent?: string }) => (
  <section className="rounded-[28px] bg-panel p-5 shadow-panel ring-1 ring-slate-200/80">
    <div className="mb-4 flex items-center gap-3">
      <span className={`h-2.5 w-2.5 rounded-full ${accent ?? "bg-accent"}`} />
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    </div>
    {children}
  </section>
);

export const MetricCard = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div className="rounded-[24px] bg-white p-5 ring-1 ring-slate-200 shadow-panel">
    <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{label}</div>
    <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
    <div className="mt-2 text-sm text-slate-600">{hint}</div>
  </div>
);

export const ActionButton = ({
  children,
  onClick,
  tone = "primary"
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "primary" | "neutral";
}) => (
  <button
    className={[
      "rounded-2xl px-4 py-2.5 text-sm font-medium transition",
      tone === "primary" ? "bg-accent text-white hover:bg-teal-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
    ].join(" ")}
    onClick={onClick}
  >
    {children}
  </button>
);
