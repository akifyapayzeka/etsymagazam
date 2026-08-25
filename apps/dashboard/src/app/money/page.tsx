"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

interface MoneySummary {
  today: { revenue: number; estimatedNet: number; orders: number };
  thisMonth: { revenue: number; net: number; orders: number };
  aiWorkedToday: { productsPublished: number; productsOptimized: number; productsGenerated: number };
  monthToDateAutopilot: { productsGenerated: number; productsPublished: number; productsOptimized: number };
  attentionRequired: Array<{ id: string; priority: string; title: string }>;
}

export default function MoneyPage() {
  const { loading } = useAuth();
  const [data, setData] = useState<MoneySummary | null>(null);

  useEffect(() => {
    if (loading) return;
    apiFetch<MoneySummary>("/api/dashboard/money").then(setData).catch(() => undefined);
  }, [loading]);

  if (loading || !data) {
    return (
      <div>
        <Nav />
        <div className="mx-auto max-w-3xl px-6 py-10 text-stone-500">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-2xl space-y-10 px-6 py-12">
        <section>
          <h1 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Today</h1>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <BigNumber label="Revenue" value={`$${data.today.revenue.toFixed(2)}`} />
            <BigNumber label="Est. Net" value={`$${data.today.estimatedNet.toFixed(2)}`} />
            <BigNumber label="Orders" value={String(data.today.orders)} />
          </div>
        </section>

        <section>
          <h1 className="text-sm font-semibold uppercase tracking-wide text-stone-400">This Month</h1>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <BigNumber label="Revenue" value={`$${data.thisMonth.revenue.toFixed(2)}`} />
            <BigNumber label="Est. Net" value={`$${data.thisMonth.net.toFixed(2)}`} />
            <BigNumber label="Orders" value={String(data.thisMonth.orders)} />
          </div>
        </section>

        <section>
          <h1 className="text-sm font-semibold uppercase tracking-wide text-stone-400">AI Worked Today</h1>
          <ul className="mt-3 space-y-1 text-sm text-stone-700">
            <li>{data.aiWorkedToday.productsPublished} new products published</li>
            <li>{data.aiWorkedToday.productsOptimized} listings optimized</li>
            <li>{data.aiWorkedToday.productsGenerated} products generated</li>
          </ul>
        </section>

        <section>
          <h1 className="text-sm font-semibold uppercase tracking-wide text-stone-400">Attention Required</h1>
          {data.attentionRequired.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">None</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm text-red-700">
              {data.attentionRequired.map((a) => (
                <li key={a.id}>
                  [{a.priority}] {a.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function BigNumber({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold text-ink">{value}</div>
      <div className="text-xs uppercase tracking-wide text-stone-400">{label}</div>
    </div>
  );
}
