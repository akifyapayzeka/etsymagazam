/**
 * Shared BullMQ queue/job names. apps/api enqueues into these; apps/worker
 * registers workers for the same names. Keeping the strings in one place
 * prevents typo-drift between producer and consumer.
 */
export const QUEUE_NAMES = {
  RESEARCH: "autopilot:research",
  PRODUCT_GENERATION: "autopilot:product-generation",
  DESIGN: "autopilot:design",
  MOCKUP: "autopilot:mockup",
  SEO: "autopilot:seo",
  IP_GUARD: "autopilot:ip-guard",
  QA: "autopilot:qa",
  PRICING: "autopilot:pricing",
  PUBLISH: "autopilot:publish",
  ANALYTICS_REFRESH: "autopilot:analytics-refresh",
  GROWTH: "autopilot:growth",
  SEASONAL_SCAN: "autopilot:seasonal-scan",
  WEBHOOK_PROCESS: "autopilot:webhook-process",
  ALERTS: "autopilot:alerts",
  STORE_DIRECTOR: "autopilot:store-director",
  SCHEDULED_DAILY: "autopilot:scheduled-daily",
  SCHEDULED_WEEKLY: "autopilot:scheduled-weekly",
  SCHEDULED_MONTHLY: "autopilot:scheduled-monthly",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Default BullMQ job options: exponential backoff + bounded retries + dead-letter via `failed` event handling. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 30 },
} as const;
