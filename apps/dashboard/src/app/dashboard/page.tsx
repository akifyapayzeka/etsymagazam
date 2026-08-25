"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { StatCard } from "@/components/StatCard";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

interface Summary {
  today: { orders: number; revenue: number; estimatedNet: number; visitors: number | null; conversion: number | null };
  autopilot: {
    productsGenerated: number;
    productsPublished: number;
    productsRejected: number;
    productsOptimized: number;
    productsDeactivated: number;
    isPaused: boolean;
    autoPublish: boolean;
    dryRun: boolean;
  };
  winners: Array<{ productId: string; _sum: { revenue: number | null; sales: number | null } }>;
  alerts: Array<{ id: string; priority: string; category: string; title: string; message: string; createdAt: string }>;
}

export default function DashboardPage() {
  const { loading } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (loading) return;
    apiFetch<Summary>("/api/dashboard/summary").then(setSummary).catch(() => undefined);
  }, [loading]);

  if (loading || !summary) {
    return (
      <div>
        <Nav />
        <div className="mx-auto max-w-6xl px-6 py-10 text-stone-500">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Today</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Orders" value={String(summary.today.orders)} />
            <StatCard label="Revenue" value={`$${summary.today.revenue.toFixed(2)}`} />
            <StatCard label="Estimated Net" value={`$${summary.today.estimatedNet.toFixed(2)}`} />
            <StatCard
              label="Conversion"
              value={summary.today.conversion != null ? `${(summary.today.conversion * 100).toFixed(1)}%` : "N/A"}
              sub={summary.today.visitors == null ? "Visitor data not connected" : undefined}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Autopilot</h2>
          <div className="mb-3 flex gap-2 text-xs">
            <Badge label={summary.autopilot.isPaused ? "PAUSED" : "RUNNING"} tone={summary.autopilot.isPaused ? "warn" : "ok"} />
            <Badge label={summary.autopilot.dryRun ? "DRY_RUN" : "LIVE"} tone={summary.autopilot.dryRun ? "warn" : "ok"} />
            <Badge label={summary.autopilot.autoPublish ? "AUTO_PUBLISH ON" : "AUTO_PUBLISH OFF"} tone="neutral" />
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <StatCard label="Generated" value={String(summary.autopilot.productsGenerated)} />
            <StatCard label="Published" value={String(summary.autopilot.productsPublished)} />
            <StatCard label="Rejected by QA" value={String(summary.autopilot.productsRejected)} />
            <StatCard label="Optimized" value={String(summary.autopilot.productsOptimized)} />
            <StatCard label="Deactivated" value={String(summary.autopilot.productsDeactivated)} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Alerts</h2>
          {summary.alerts.length === 0 ? (
            <p className="text-sm text-stone-500">None — everything looks normal.</p>
          ) : (
            <ul className="space-y-2">
              {summary.alerts.map((a) => (
                <li key={a.id} className="rounded border border-stone-200 bg-white p-3 text-sm">
                  <span className="mr-2 font-mono text-xs text-red-600">{a.priority}</span>
                  <span className="font-medium">{a.title}</span>
                  <p className="mt-1 text-stone-500">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "ok" | "warn" | "neutral" }) {
  const toneClass =
    tone === "ok" ? "bg-green-100 text-green-800" : tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600";
  return <span className={`rounded px-2 py-1 font-medium ${toneClass}`}>{label}</span>;
}
