import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.SESSION_SECRET ??= "test-secret";
});

describe("API server", () => {
  it("boots and responds to /health without touching the database", async () => {
    const { buildServer } = await import("./server.js");
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    await app.close();
  });

  it("rejects unauthenticated dashboard requests with 401", async () => {
    const { buildServer } = await import("./server.js");
    const app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/api/dashboard/summary" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
