import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "@etsymagazam/etsy";

afterEach(() => {
  vi.useRealTimers();
});

describe("RateLimiter", () => {
  it("paces requests to respect the QPS limit", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(10, 10_000); // 10 QPS -> 100ms min interval
    const timestamps: number[] = [];

    const run = async () => {
      for (let i = 0; i < 3; i++) {
        await limiter.acquire();
        timestamps.push(Date.now());
      }
    };
    const promise = run();
    await vi.runAllTimersAsync();
    await promise;

    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(100);
    expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(100);
  });

  it("throws once the daily query budget is exhausted", async () => {
    const limiter = new RateLimiter(1000, 2); // effectively unlimited QPS, tiny daily budget
    await limiter.acquire();
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toThrow(/daily query budget/i);
  });

  it("reports remaining daily quota", async () => {
    const limiter = new RateLimiter(1000, 5);
    expect(limiter.remainingToday).toBe(5);
    await limiter.acquire();
    expect(limiter.remainingToday).toBe(4);
  });
});
