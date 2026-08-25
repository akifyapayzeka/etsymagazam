"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

interface Alert {
  id: string;
  priority: "P0" | "P1" | "P2";
  category: string;
  title: string;
  message: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  createdAt: string;
}

export default function AlertsPage() {
  const { loading } = useAuth();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);

  function load() {
    apiFetch<Alert[]>("/api/dashboard/alerts").then(setAlerts).catch(() => undefined);
  }

  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function resolve(id: string) {
    await apiFetch(`/api/dashboard/alerts/${id}/resolve`, { method: "POST" });
    load();
  }

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-4 text-lg font-semibold">Alerts</h1>
        {!alerts ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing here — that's a good sign.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start justify-between rounded border border-stone-200 bg-white p-4 text-sm">
                <div>
                  <span className="mr-2 font-mono text-xs text-red-600">{a.priority}</span>
                  <span className="font-medium">{a.title}</span>
                  <p className="mt-1 text-stone-500">{a.message}</p>
                  <p className="mt-1 text-xs text-stone-400">{new Date(a.createdAt).toLocaleString()}</p>
                </div>
                {a.status === "OPEN" && (
                  <button onClick={() => resolve(a.id)} className="shrink-0 rounded border border-stone-300 px-3 py-1 text-xs hover:bg-stone-50">
                    Resolve
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
