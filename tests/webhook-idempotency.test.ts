import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SIGNING_SECRET_RAW = Buffer.from("test-webhook-signing-secret-bytes");
const SIGNING_SECRET = `whsec_${SIGNING_SECRET_RAW.toString("base64")}`;

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ETSY_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;

const findUniqueShop = vi.fn();
const findUniqueWebhookEvent = vi.fn();
const createWebhookEvent = vi.fn();
const queueAdd = vi.fn();

vi.mock("@etsymagazam/database", () => ({
  prisma: {
    shop: { findUnique: findUniqueShop },
    webhookEvent: { findUnique: findUniqueWebhookEvent, create: createWebhookEvent },
  },
}));

vi.mock("../apps/api/src/lib/queues.js", () => ({
  getQueue: () => ({ add: queueAdd }),
  QUEUE_NAMES: { WEBHOOK_PROCESS: "autopilot:webhook-process" },
}));

function sign(id: string, ts: string, body: string): string {
  const sig = createHmac("sha256", SIGNING_SECRET_RAW).update(`${id}.${ts}.${body}`).digest("base64");
  return `v1,${sig}`;
}

describe("Etsy webhook route (integration: idempotency)", () => {
  beforeEach(() => {
    findUniqueShop.mockReset().mockResolvedValue({ id: "shop_1", etsyShopId: "12345" });
    findUniqueWebhookEvent.mockReset();
    createWebhookEvent.mockReset().mockResolvedValue({ id: "evt_row_1" });
    queueAdd.mockReset();
  });

  async function buildApp() {
    const { buildServer } = await import("../apps/api/src/server.js");
    return buildServer();
  }

  it("accepts a validly-signed, new webhook event and enqueues processing", async () => {
    const app = await buildApp();
    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 12345 });
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));

    findUniqueWebhookEvent.mockResolvedValue(null); // not seen before

    const res = await app.inject({
      method: "POST",
      url: "/api/etsy/webhooks",
      headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sign(id, ts, body), "content-type": "application/json" },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "accepted" });
    expect(createWebhookEvent).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("ignores a duplicate delivery of the same webhook id without creating a second row or job", async () => {
    const app = await buildApp();
    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 12345 });
    const id = "msg_dup";
    const ts = String(Math.floor(Date.now() / 1000));

    findUniqueWebhookEvent.mockResolvedValue({ id: "already-here", externalId: id }); // already processed once

    const res = await app.inject({
      method: "POST",
      url: "/api/etsy/webhooks",
      headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sign(id, ts, body), "content-type": "application/json" },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "duplicate_ignored" });
    expect(createWebhookEvent).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a webhook with an invalid signature (401), never touching the database", async () => {
    const app = await buildApp();
    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 12345 });
    const id = "msg_bad_sig";
    const ts = String(Math.floor(Date.now() / 1000));

    const res = await app.inject({
      method: "POST",
      url: "/api/etsy/webhooks",
      headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": "v1,not-the-real-signature", "content-type": "application/json" },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
    expect(findUniqueWebhookEvent).not.toHaveBeenCalled();
    await app.close();
  });
});
