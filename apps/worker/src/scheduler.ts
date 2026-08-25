import { QUEUE_NAMES } from "@etsymagazam/core";
import { getQueue } from "./lib/queues.js";

/**
 * Registers all recurring automations. Cron patterns are UTC. Safe to call
 * on every worker boot — BullMQ's repeatable-job dedup (keyed by queue +
 * job name + pattern) means re-registering an identical schedule is a
 * no-op, not a duplicate.
 */
export async function registerScheduledJobs(): Promise<void> {
  // --- Daily ---
  await getQueue(QUEUE_NAMES.SEASONAL_SCAN).add("scan-seasonal", {}, { repeat: { pattern: "0 4 * * *" } });
  await getQueue(QUEUE_NAMES.ANALYTICS_REFRESH).add("refresh-analytics", {}, { repeat: { pattern: "0 5 * * *" } });
  await getQueue(QUEUE_NAMES.STORE_DIRECTOR).add("daily-planning", {}, { repeat: { pattern: "0 6 * * *" } });
  await getQueue(QUEUE_NAMES.ALERTS).add("automation-health-check", {}, { repeat: { pattern: "0 7 * * *" } });

  // --- Weekly (Mondays) ---
  await getQueue(QUEUE_NAMES.GROWTH).add("scan-winners", {}, { repeat: { pattern: "0 3 * * 1" } });
  await getQueue(QUEUE_NAMES.PRICING).add("weekly-price-review", {}, { repeat: { pattern: "0 8 * * 1" } });

  // --- Monthly (1st of month) ---
  await getQueue(QUEUE_NAMES.SCHEDULED_MONTHLY).add("monthly-report", {}, { repeat: { pattern: "0 2 1 * *" } });
}
