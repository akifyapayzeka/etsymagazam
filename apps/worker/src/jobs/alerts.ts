import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { raiseAlert } from "../lib/decisions.js";

const log = createLogger("job:alerts");

/**
 * Daily automation health check. Deliberately conservative about what
 * counts as alert-worthy — normal QA rejections and routine retries are
 * NOT alerts (they're just automation doing its job); this only flags
 * things a human genuinely needs to look at.
 */
export async function handleAutomationHealthCheck(): Promise<void> {
  const shop = await prisma.shop.findFirst();
  if (!shop) return;

  const connection = await prisma.etsyConnection.findFirst({
    where: { shopId: shop.id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!connection) {
    log.info("No Etsy connection yet — nothing to health-check.");
    return;
  }

  if (connection.expiresAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    await raiseAlert({
      shopId: shop.id,
      priority: "P0",
      category: "etsy_auth_lost",
      title: "Etsy authorization appears lost",
      message: "The stored Etsy access token has been expired for over 24h without a successful refresh. Reconnect Etsy from the dashboard.",
    });
  }

  const stuckWebhooks = await prisma.webhookEvent.count({
    where: { status: "RECEIVED", receivedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (stuckWebhooks > 0) {
    await raiseAlert({
      shopId: shop.id,
      priority: "P1",
      category: "webhook_stopped",
      title: "Webhook events are not being processed",
      message: `${stuckWebhooks} webhook event(s) have been stuck in RECEIVED for over 10 minutes — the worker may be down or backed up.`,
    });
  }

  const state = await prisma.autopilotState.findUnique({ where: { shopId: shop.id } });
  if (state && !state.isPaused) {
    const recentActivity = await prisma.agentDecision.count({ where: { createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } } });
    if (recentActivity === 0) {
      await raiseAlert({
        shopId: shop.id,
        priority: "P1",
        category: "automation_stalled",
        title: "No autopilot activity in 48 hours",
        message: "Autopilot is not paused, but no agent decisions have been logged in the last 48 hours. Check the worker process and job queues.",
      });
    }
  }

  const recentCancellations = await prisma.product.count({
    where: { status: "CANCELLED", updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  if (recentCancellations >= 5) {
    await raiseAlert({
      shopId: shop.id,
      priority: "P2",
      category: "quality_pattern",
      title: "Unusually high QA/IP rejection rate",
      message: `${recentCancellations} products were cancelled after exhausting QA retries in the last 24 hours — may indicate a prompt or template regression worth reviewing.`,
    });
  }
}
