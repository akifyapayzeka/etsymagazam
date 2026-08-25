import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { refreshAnalytics } from "../agents/analytics.js";

const log = createLogger("job:webhook");

/**
 * Etsy's order webhooks carry only { event_type, resource_url, shop_id } —
 * no order detail. Rather than re-implement a second receipt-fetching path,
 * a webhook simply triggers the same analytics refresh the scheduled poll
 * runs, which pulls full order detail via listShopReceipts and is
 * idempotent either way.
 */
export async function handleProcessWebhookEvent(data: { webhookEventId: string }): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({ where: { id: data.webhookEventId } });
  if (!event) return;

  try {
    if (event.shopId) {
      await refreshAnalytics(event.shopId);
    }
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date() } });
  } catch (err) {
    log.error({ err, eventId: event.id }, "Failed to process webhook event");
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
