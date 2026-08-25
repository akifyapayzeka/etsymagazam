"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}

export default function AuditLogPage() {
  const { loading } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    if (loading) return;
    apiFetch<AuditEntry[]>("/api/dashboard/audit-log").then(setEntries).catch(() => undefined);
  }, [loading]);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 text-lg font-semibold">Audit Log</h1>
        <p className="mb-4 text-sm text-stone-500">Every change the autopilot (or you) made to the store, with why.</p>
        {!entries ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="rounded border border-stone-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-xs text-stone-400">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-stone-500">
                  {e.actor} · {e.entityType}
                  {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""}
                </p>
                {e.reason && <p className="mt-1 text-stone-600">{e.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
