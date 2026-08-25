import { DEFAULT_JOB_OPTIONS, loadEnv, QUEUE_NAMES, type QueueName } from "@etsymagazam/core";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

let connection: Redis | undefined;
const queues = new Map<QueueName, Queue>();

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

/** Producer-side queue handle. apps/worker registers the matching consumer for the same name. */
export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: getConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS });
  queues.set(name, queue);
  return queue;
}

export { QUEUE_NAMES };
