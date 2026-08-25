import { loadEnv } from "@etsymagazam/core";
import { Redis } from "ioredis";

let connection: Redis | undefined;

/** Shared ioredis connection for all BullMQ Workers/Queues in this process. */
export function getRedisConnection(): Redis {
  if (!connection) {
    connection = new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}
