import { loadEnv } from "@etsymagazam/core";
import { Prisma, prisma } from "@etsymagazam/database";
import { parseWebhookPayload, verifyWebhookSignature, WebhookVerificationError } from "@etsymagazam/etsy";
import type { FastifyInstance } from "fastify";
import { getQueue, QUEUE_NAMES } from "../lib/queues.js";

/**
 * Etsy order webhooks (order.paid / order.canceled / order.shipped /
 * order.delivered — see docs/ETSY_SETUP.md for how to register the
 * endpoint in the Developer Portal's Webhook portal). This is a
 * best-effort real-time channel; apps/worker's scheduled shop-receipts
 * poll is the reliability fallback if a webhook is ever missed.
 */
export default async function etsyWebhookRoutes(app: FastifyInstance) {
  // Capture the raw request body (needed for HMAC signature verification) alongside the parsed JSON.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    (req as { rawBody?: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch {
      done(null, undefined);
    }
  });

  app.post("/api/etsy/webhooks", async (req, reply) => {
    const env = loadEnv();
    if (!env.ETSY_WEBHOOK_SIGNING_SECRET) {
      app.log.warn("Received an Etsy webhook but ETSY_WEBHOOK_SIGNING_SECRET is not configured — rejecting.");
      reply.code(503);
      return { error: "webhooks_not_configured" };
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      reply.code(400);
      return { error: "empty_body" };
    }

    try {
      verifyWebhookSignature(
        rawBody,
        {
          "webhook-id": String(req.headers["webhook-id"] ?? ""),
          "webhook-timestamp": String(req.headers["webhook-timestamp"] ?? ""),
          "webhook-signature": String(req.headers["webhook-signature"] ?? ""),
        },
        env.ETSY_WEBHOOK_SIGNING_SECRET,
      );
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        app.log.warn({ err: err.message }, "Rejected Etsy webhook: signature verification failed");
        reply.code(401);
        return { error: "invalid_signature" };
      }
      throw err;
    }

    const payload = parseWebhookPayload(rawBody);
    const externalId = String(req.headers["webhook-id"] ?? "");

    // Cheap pre-check to skip the common duplicate-delivery case without
    // touching the queue. This alone is NOT the idempotency guarantee —
    // two redeliveries of the same webhook can both read "not found" here
    // before either has inserted (Etsy does redeliver on timeout, and nginx
    // etc. can forward a request twice). The real guarantee is the DB's
    // unique (provider, externalId) constraint below: only one create() can
    // ever succeed for a given externalId, and the other's constraint
    // violation is caught and treated as the duplicate it is, rather than
    // surfacing as a 500 (which would just make Etsy redeliver again).
    const shop = await prisma.shop.findUnique({ where: { etsyShopId: String(payload.shop_id) } });
    const existing = await prisma.webhookEvent.findUnique({
      where: { provider_externalId: { provider: "etsy", externalId } },
    });

    if (existing) {
      reply.code(200);
      return { status: "duplicate_ignored" };
    }

    let event;
    try {
      event = await prisma.webhookEvent.create({
        data: {
          shopId: shop?.id,
          provider: "etsy",
          eventType: payload.event_type,
          externalId,
          payload: payload as unknown as object,
          status: "RECEIVED",
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        reply.code(200);
        return { status: "duplicate_ignored" };
      }
      throw err;
    }

    await getQueue(QUEUE_NAMES.WEBHOOK_PROCESS).add("process-webhook-event", { webhookEventId: event.id });

    reply.code(200);
    return { status: "accepted" };
  });
}
