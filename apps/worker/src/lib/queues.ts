import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, type QueueName } from "@etsymagazam/core";
import { Queue } from "bullmq";
import { getRedisConnection } from "./redis.js";

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: getRedisConnection(), defaultJobOptions: DEFAULT_JOB_OPTIONS });
  queues.set(name, queue);
  return queue;
}

export { QUEUE_NAMES };
