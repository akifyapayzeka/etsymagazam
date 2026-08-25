import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** packages/core/src -> repo root */
const REPO_ROOT = path.resolve(__dirname, "../../../");

/**
 * Loads `.env` from the repo root (if present) into process.env, without
 * overriding variables the process/platform already set — real deployment
 * secrets (Docker Compose `env_file`, a PaaS's env panel, CI secrets)
 * always win over a local .env file. Safe to call more than once.
 */
function loadDotEnvFile(): void {
  const envPath = path.join(REPO_ROOT, ".env");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

/**
 * Central environment schema. Every app (api, worker, dashboard) imports
 * `loadEnv()` instead of reading `process.env` directly, so a missing or
 * malformed secret fails fast at boot instead of surfacing as a mystery bug
 * mid-pipeline.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  API_BASE_URL: z.string().default("http://localhost:4000"),
  DASHBOARD_BASE_URL: z.string().default("http://localhost:3000"),
  ETSY_OAUTH_REDIRECT_URI: z.string().default("http://localhost:4000/api/etsy/oauth/callback"),
  ETSY_WEBHOOK_URL: z.string().optional().default(""),

  ETSY_API_KEYSTRING: z.string().optional().default(""),
  ETSY_SHARED_SECRET: z.string().optional().default(""),
  ETSY_SHOP_ID: z.string().optional().default(""),
  ETSY_WEBHOOK_SIGNING_SECRET: z.string().optional().default(""),
  ETSY_OAUTH_SCOPES: z
    .string()
    .default("listings_r,listings_w,listings_d,shops_r,shops_w,transactions_r,transactions_w,profile_r"),

  ENCRYPTION_KEY: z.string().optional().default(""),

  SESSION_SECRET: z.string().optional().default("dev-insecure-session-secret-change-me"),
  ADMIN_EMAIL: z.string().optional().default(""),
  ADMIN_PASSWORD_HASH: z.string().optional().default(""),

  AI_TEXT_PROVIDER: z.enum(["openai", "gemini", "mock"]).default("mock"),
  AI_IMAGE_PROVIDER: z.enum(["openai", "gemini", "mock"]).default("mock"),
  OPENAI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  AI_TEXT_MODEL_CHEAP: z.string().default("gpt-4o-mini"),
  AI_TEXT_MODEL_PREMIUM: z.string().default("gpt-4o"),
  AI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  GEMINI_TEXT_MODEL: z.string().default("gemini-1.5-flash"),
  GEMINI_IMAGE_MODEL: z.string().default("imagen-3.0-generate-001"),

  SERPAPI_API_KEY: z.string().optional().default(""),
  PINTEREST_API_KEY: z.string().optional().default(""),

  AUTO_PUBLISH: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  MAX_PRODUCTS_PER_DAY: z.coerce.number().int().positive().default(3),
  MAX_PRODUCTS_PER_WEEK: z.coerce.number().int().positive().default(10),
  QA_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(90),
  QA_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  IP_RISK_REJECT_THRESHOLD: z.coerce.number().int().min(0).max(100).default(40),
  MIN_PRICE: z.coerce.number().positive().default(3),
  MAX_PRICE: z.coerce.number().positive().default(45),
  MAX_DAILY_PRICE_CHANGE: z.coerce.number().int().min(0).default(1),

  ALERT_EMAIL_TO: z.string().optional().default(""),
  ALERT_WEBHOOK_URL: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_ENDPOINT: z.string().optional().default(""),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses and caches process.env once. Throws with a clear message on first bad boot. */
export function loadEnv(): Env {
  if (cached) return cached;
  loadDotEnvFile();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example for the full list.`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests: reset the cached env so a fresh loadEnv() re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
