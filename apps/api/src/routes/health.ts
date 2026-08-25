import { prisma } from "@etsymagazam/database";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { loadEnv } from "@etsymagazam/core";

export default async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  app.get("/health/ready", async (_req, reply) => {
    const checks: Record<string, "ok" | "error"> = { database: "error", redis: "error" };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    try {
      const redis = new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    reply.code(healthy ? 200 : 503);
    return { status: healthy ? "ok" : "degraded", checks };
  });
}
