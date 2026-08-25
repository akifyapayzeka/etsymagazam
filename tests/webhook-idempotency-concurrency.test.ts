import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SIGNING_SECRET_RAW = Buffer.from("test-webhook-signing-secret-bytes-concurrency");
const SIGNING_SECRET = `whsec_${SIGNING_SECRET_RAW.toString("base64")}`;

process.env.DATABASE_URL ??= "postgresql://etsy_autopilot:ci_password@localhost:5432/etsy_autopilot";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ETSY_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;

const queueAdd = vi.fn();
vi.mock("../apps/api/src/lib/queues.js", () => ({
  getQueue: () => ({ add: queueAdd }),
  QUEUE_NAMES: { WEBHOOK_PROCESS: "autopilot-webhook-process" },
}));

function sign(id: string, ts: string, body: string): string {
  const sig = createHmac("sha256", SIGNING_SECRET_RAW).update(`${id}.${ts}.${body}`).digest("base64");
  return `v1,${sig}`;
}

/**
 * Uses the REAL Postgres connection (no prisma mock), because the actual
 * guarantee under test is the database's unique (provider, externalId)
 * constraint — the fix that closes the findUnique-then-create race window
 * only proves anything when the "then-create" step hits a real constraint.
 */
describe("Etsy webhook route (integration: real-DB race condition on duplicate delivery)", () => {
  const externalId = `race-test-${Date.now()}`;

  beforeEach(() => {
    queueAdd.mockReset();
  });

  afterEach(async () => {
    const { prisma } = await import("@etsymagazam/database");
    await prisma.webhookEvent.deleteMany({ where: { externalId } });
  });

  it("never 500s and only ever stores one row when two identical deliveries race past the pre-check simultaneously", async () => {
    const { buildServer } = await import("../apps/api/src/server.js");
    const app = await buildServer();

    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 999999 });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = { "webhook-id": externalId, "webhook-timestamp": ts, "webhook-signature": sign(externalId, ts, body), "content-type": "application/json" };

    // Fired concurrently — this is what a real duplicate delivery (Etsy
    // retry racing the original, or a proxy forwarding twice) looks like.
    const [resA, resB] = await Promise.all([
      app.inject({ method: "POST", url: "/api/etsy/webhooks", headers, payload: body }),
      app.inject({ method: "POST", url: "/api/etsy/webhooks", headers, payload: body }),
    ]);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    const statuses = [resA.json().status, resB.json().status].sort();
    expect(statuses).toEqual(["accepted", "duplicate_ignored"]);

    const { prisma } = await import("@etsymagazam/database");
    const rows = await prisma.webhookEvent.findMany({ where: { externalId } });
    expect(rows).toHaveLength(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);

    await app.close();
  }, 20_000);
});
