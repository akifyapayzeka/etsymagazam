import pino from "pino";
import { loadEnv } from "./env.js";

/**
 * Structured JSON logger shared by api/worker/dashboard server code.
 * `createLogger("trend-scout-agent")` scopes every line with a `component`
 * field so log aggregation can filter per agent/service.
 */
/**
 * Defense-in-depth redaction: no code path in this repo intentionally logs
 * a secret (audited — decisions/audit-log entries log counts/booleans/ids,
 * never token values), but a field named like one of these anywhere in a
 * logged object is replaced rather than trusted.
 */
const REDACT_PATHS = [
  "*.accessToken",
  "*.refreshToken",
  "*.accessTokenEnc",
  "*.refreshTokenEnc",
  "*.access_token",
  "*.refresh_token",
  "*.apiKeystring",
  "*.sharedSecret",
  "*.encryptionKey",
  "*.sessionSecret",
  "*.password",
  "*.passwordHash",
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
];

export function createLogger(component: string) {
  const env = loadEnv();
  return pino({
    level: env.LOG_LEVEL,
    base: { component },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
