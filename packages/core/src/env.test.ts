import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./env.js";

const REQUIRED_BASE = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
};

const REQUIRED_PROD_SECRETS = {
  ETSY_API_KEYSTRING: "real-keystring",
  ETSY_SHARED_SECRET: "real-shared-secret",
  ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=", // 32 bytes, base64
  SESSION_SECRET: "a-real-random-session-secret",
  ADMIN_EMAIL: "owner@example.com",
  ADMIN_PASSWORD_HASH: "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01",
};

const ENV_KEYS = [
  "NODE_ENV",
  ...Object.keys(REQUIRED_BASE),
  ...Object.keys(REQUIRED_PROD_SECRETS),
] as const;

function setEnv(overrides: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries({ ...REQUIRED_BASE, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("loadEnv production secret guard", () => {
  beforeEach(() => {
    resetEnvCache();
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    resetEnvCache();
  });

  it("does not enforce secret presence outside production (dev/test boot with empty secrets is fine)", () => {
    setEnv({ NODE_ENV: "development" });
    expect(() => loadEnv()).not.toThrow();
  });

  it("boots in production when every required secret is present and none is a known dev default", () => {
    setEnv({ NODE_ENV: "production", ...REQUIRED_PROD_SECRETS });
    expect(() => loadEnv()).not.toThrow();
  });

  it("refuses to boot in production when a required secret is empty, naming which one", () => {
    setEnv({ NODE_ENV: "production", ...REQUIRED_PROD_SECRETS, ETSY_SHARED_SECRET: "" });
    expect(() => loadEnv()).toThrow(/ETSY_SHARED_SECRET is empty/);
  });

  it("refuses to boot in production when SESSION_SECRET is still the known dev-only default", () => {
    setEnv({ NODE_ENV: "production", ...REQUIRED_PROD_SECRETS, SESSION_SECRET: "dev-insecure-session-secret-change-me" });
    expect(() => loadEnv()).toThrow(/SESSION_SECRET is still set to a known dev-only default/);
  });

  it("refuses to boot in production when ENCRYPTION_KEY doesn't decode to 32 bytes", () => {
    setEnv({ NODE_ENV: "production", ...REQUIRED_PROD_SECRETS, ENCRYPTION_KEY: "dG9vLXNob3J0" });
    expect(() => loadEnv()).toThrow(/ENCRYPTION_KEY must decode to exactly 32 bytes/);
  });

  it("reports every missing secret at once, not just the first", () => {
    setEnv({ NODE_ENV: "production", ...REQUIRED_PROD_SECRETS, ADMIN_EMAIL: "", ADMIN_PASSWORD_HASH: "" });
    try {
      loadEnv();
      throw new Error("expected loadEnv to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/ADMIN_EMAIL is empty/);
      expect(message).toMatch(/ADMIN_PASSWORD_HASH is empty/);
    }
  });
});
