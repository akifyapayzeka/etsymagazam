import pino from "pino";
import { loadEnv } from "./env.js";

/**
 * Structured JSON logger shared by api/worker/dashboard server code.
 * `createLogger("trend-scout-agent")` scopes every line with a `component`
 * field so log aggregation can filter per agent/service.
 */
export function createLogger(component: string) {
  const env = loadEnv();
  return pino({
    level: env.LOG_LEVEL,
    base: { component },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
