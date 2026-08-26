"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

interface AutopilotState {
  isPaused: boolean;
  pausedReason: string | null;
  autoPublish: boolean;
  dryRun: boolean;
  maxProductsPerDay: number;
  maxProductsPerWeek: number;
  qaMinScore: number;
  ipRiskRejectThreshold: number;
  minPrice: string;
  maxPrice: string;
  maxDailyPriceChange: number;
}

export default function SettingsPage() {
  const { loading } = useAuth();
  const [state, setState] = useState<AutopilotState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    apiFetch<AutopilotState>("/api/dashboard/autopilot").then(setState).catch(() => undefined);
  }

  useEffect(() => {
    if (!loading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function togglePause() {
    if (!state) return;
    setSaving(true);
    setMessage(null);
    try {
      if (state.isPaused) {
        await apiFetch("/api/dashboard/autopilot/resume", { method: "POST" });
      } else {
        await apiFetch("/api/dashboard/autopilot/pause", { method: "POST", body: JSON.stringify({ reason: "Paused from dashboard" }) });
      }
      load();
    } catch {
      setMessage("Failed to update autopilot state.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!state) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiFetch<AutopilotState>("/api/dashboard/autopilot/settings", {
        method: "PATCH",
        body: JSON.stringify({
          autoPublish: state.autoPublish,
          dryRun: state.dryRun,
          maxProductsPerDay: Number(state.maxProductsPerDay),
          maxProductsPerWeek: Number(state.maxProductsPerWeek),
          qaMinScore: Number(state.qaMinScore),
          ipRiskRejectThreshold: Number(state.ipRiskRejectThreshold),
          minPrice: Number(state.minPrice),
          maxPrice: Number(state.maxPrice),
          maxDailyPriceChange: Number(state.maxDailyPriceChange),
        }),
      });
      setState(updated);
      setMessage("Saved.");
    } catch {
      setMessage("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function connectEtsy() {
    const res = await apiFetch<{ authorizeUrl: string }>("/api/etsy/oauth/start");
    window.location.href = res.authorizeUrl;
  }

  if (loading || !state) {
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
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Kill switch</h2>
          <p className="mb-4 text-sm text-stone-500">
            Pausing stops new product generation, auto-publish, and automatic price/listing changes. Analytics, order
            tracking, and alerts keep running.
          </p>
          <button
            onClick={togglePause}
            disabled={saving}
            className={`rounded px-4 py-2 text-sm font-medium text-white ${state.isPaused ? "bg-green-700" : "bg-red-700"}`}
          >
            {state.isPaused ? "Resume Autopilot" : "Pause Autopilot"}
          </button>
          {state.isPaused && state.pausedReason && <p className="mt-2 text-xs text-stone-400">{state.pausedReason}</p>}
          {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Etsy connection</h2>
          <p className="mb-4 text-sm text-stone-500">
            Connect your Etsy shop via OAuth. See docs/ETSY_SETUP.md for the one-time Developer Portal steps first.
          </p>
          <button onClick={connectEtsy} className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">
            Connect Etsy
          </button>
        </section>

        <form onSubmit={saveSettings} className="rounded-lg border border-stone-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Autopilot settings</h2>

          <div className="mb-4 flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={state.autoPublish} onChange={(e) => setState({ ...state, autoPublish: e.target.checked })} />
              AUTO_PUBLISH
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={state.dryRun} onChange={(e) => setState({ ...state, dryRun: e.target.checked })} />
              DRY_RUN
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Max products / day" value={state.maxProductsPerDay} onChange={(v) => setState({ ...state, maxProductsPerDay: v })} />
            <Field label="Max products / week" value={state.maxProductsPerWeek} onChange={(v) => setState({ ...state, maxProductsPerWeek: v })} />
            <Field label="QA min score" value={state.qaMinScore} onChange={(v) => setState({ ...state, qaMinScore: v })} />
            <Field
              label="IP risk reject threshold"
              value={state.ipRiskRejectThreshold}
              onChange={(v) => setState({ ...state, ipRiskRejectThreshold: v })}
            />
            <Field label="Min price ($)" value={Number(state.minPrice)} onChange={(v) => setState({ ...state, minPrice: String(v) })} />
            <Field label="Max price ($)" value={Number(state.maxPrice)} onChange={(v) => setState({ ...state, maxPrice: String(v) })} />
            <Field
              label="Max price changes / day"
              value={state.maxDailyPriceChange}
              onChange={(v) => setState({ ...state, maxDailyPriceChange: v })}
            />
          </div>

          <button type="submit" disabled={saving} className="mt-6 rounded bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save settings"}
          </button>
          {message && <span className="ml-3 text-sm text-stone-500">{message}</span>}
        </form>
      </main>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-stone-600">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded border border-stone-300 px-3 py-2"
      />
    </label>
  );
}
