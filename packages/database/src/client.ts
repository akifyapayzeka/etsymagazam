import { PrismaClient } from "../generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __etsymagazamPrisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient. In dev, hot-reload can create many clients and
 * exhaust Postgres connections, so we cache it on `globalThis`.
 */
export const prisma: PrismaClient =
  globalThis.__etsymagazamPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__etsymagazamPrisma = prisma;
}
