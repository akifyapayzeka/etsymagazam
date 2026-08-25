import http from "node:http";
import { createLogger, QUEUE_NAMES, type QueueName } from "@etsymagazam/core";
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./lib/redis.js";
import { raiseAlert } from "./lib/decisions.js";
import { registerScheduledJobs } from "./scheduler.js";

import { handleScoreManualKeywords } from "./jobs/research.js";
import { handleGenerateProduct } from "./jobs/product-generation.js";
import { handleRunQa } from "./jobs/qa.js";
import { handleSetInitialPrice, handleWeeklyPriceReview } from "./jobs/pricing.js";
import { handlePublishListing } from "./jobs/publish.js";
import { handleProcessWebhookEvent } from "./jobs/webhook.js";
import { handleRefreshAnalytics } from "./jobs/analytics.js";
import { handleScanWinners } from "./jobs/growth.js";
import { handleScanSeasonal } from "./jobs/seasonal.js";
import { handleDailyPlanning } from "./jobs/store-director.js";
import { handleAutomationHealthCheck } from "./jobs/alerts.js";
import { handleMonthlyReport } from "./jobs/monthly.js";

const log = createLogger("worker");

/** name -> per-job-name dispatch table for that queue's Worker processor. */
const PROCESSORS: Record<QueueName, (job: Job) => Promise<unknown>> = {
  [QUEUE_NAMES.RESEARCH]: (job) => handleScoreManualKeywords(job.data),
  [QUEUE_NAMES.PRODUCT_GENERATION]: (job) => handleGenerateProduct(job.data),
  [QUEUE_NAMES.DESIGN]: async () => undefined, // folded into PRODUCT_GENERATION (see docs/ARCHITECTURE.md)
  [QUEUE_NAMES.MOCKUP]: async () => undefined, // folded into PRODUCT_GENERATION
  [QUEUE_NAMES.SEO]: async () => undefined, // folded into PRODUCT_GENERATION
  [QUEUE_NAMES.IP_GUARD]: async () => undefined, // folded into QA
  [QUEUE_NAMES.QA]: (job) => handleRunQa(job.data),
  [QUEUE_NAMES.PRICING]: (job) => (job.name === "weekly-price-review" ? handleWeeklyPriceReview() : handleSetInitialPrice(job.data)),
  [QUEUE_NAMES.PUBLISH]: (job) => handlePublishListing(job.data),
  [QUEUE_NAMES.ANALYTICS_REFRESH]: () => handleRefreshAnalytics(),
  [QUEUE_NAMES.GROWTH]: () => handleScanWinners(),
  [QUEUE_NAMES.SEASONAL_SCAN]: () => handleScanSeasonal(),
  [QUEUE_NAMES.WEBHOOK_PROCESS]: (job) => handleProcessWebhookEvent(job.data),
  [QUEUE_NAMES.ALERTS]: () => handleAutomationHealthCheck(),
  [QUEUE_NAMES.STORE_DIRECTOR]: () => handleDailyPlanning(),
  [QUEUE_NAMES.SCHEDULED_DAILY]: async () => undefined,
  [QUEUE_NAMES.SCHEDULED_WEEKLY]: async () => undefined,
  [QUEUE_NAMES.SCHEDULED_MONTHLY]: () => handleMonthlyReport(),
};

const workers: Worker[] = [];

for (const queueName of Object.values(QUEUE_NAMES)) {
  const processor = PROCESSORS[queueName];
  const worker = new Worker(queueName, processor, { connection: getRedisConnection(), concurrency: 2 });

  worker.on("completed", (job) => log.debug({ queue: queueName, jobId: job.id, jobName: job.name }, "Job completed"));

  worker.on("failed", async (job, err) => {
    log.error({ queue: queueName, jobId: job?.id, jobName: job?.name, err: err.message }, "Job failed");
    // A job that has exhausted all its retries (see DEFAULT_JOB_OPTIONS) is a dead letter — surface it, don't just swallow it.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await raiseAlert({
        priority: "P1",
        category: "automation_failure",
        title: `Job "${job.name}" failed permanently`,
        message: `Queue ${queueName}, job ${job.id}: ${err.message}`,
        context: { queue: queueName, jobName: job.name, jobId: job.id, data: job.data as unknown },
      }).catch((alertErr) => log.error({ alertErr }, "Failed to raise alert for dead-letter job"));
    }
  });

  workers.push(worker);
}

await registerScheduledJobs();
log.info({ queues: Object.values(QUEUE_NAMES) }, "Worker started — all queues registered, scheduled jobs armed");

// Minimal health endpoint for container/orchestrator health checks.
const port = Number(process.env.PORT ?? 4100);
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", workers: workers.length }));
    return;
  }
  res.writeHead(404);
  res.end();
});
healthServer.listen(port, () => log.info(`Worker health endpoint listening on :${port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    log.info("Shutting down worker...");
    await Promise.all(workers.map((w) => w.close()));
    healthServer.close();
    process.exit(0);
  });
}
