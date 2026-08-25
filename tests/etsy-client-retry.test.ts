import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EtsyApiClient, EtsyApiError } from "@etsymagazam/etsy";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function makeClient(fetchImpl: typeof fetch) {
  return new EtsyApiClient({
    apiKeystring: "test-key",
    shopId: "123",
    tokenProvider: { getAccessToken: async () => "test-token" },
    fetchImpl,
    maxRetries: 3,
  });
}

describe("EtsyApiClient retry/backoff", () => {
  it("retries on 429 and eventually succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { "retry-after": "0" } });
      }
      return new Response(JSON.stringify({ shop_id: 123, shop_name: "Test Shop" }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const resultPromise = client.getShop("123");
    await vi.runAllTimersAsync();
    const shop = await resultPromise;

    expect(shop.shop_name).toBe("Test Shop");
    expect(calls).toBe(3);
  });

  it("retries on 5xx errors", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) return new Response("server error", { status: 502 });
      return new Response(JSON.stringify({ shop_id: 1, shop_name: "OK" }), { status: 200 });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    const resultPromise = client.getShop("1");
    await vi.runAllTimersAsync();
    await resultPromise;
    expect(calls).toBe(2);
  });

  it("does not retry on 4xx client errors (e.g. 404) and throws EtsyApiError", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    }) as unknown as typeof fetch;

    const client = makeClient(fetchImpl);
    await expect(client.getShop("999")).rejects.toBeInstanceOf(EtsyApiError);
    expect(calls).toBe(1);
  });

  it("gives up after maxRetries and throws", async () => {
    const fetchImpl = vi.fn(async () => new Response("still failing", { status: 500 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const resultPromise = client.getShop("1");
    const assertion = expect(resultPromise).rejects.toBeInstanceOf(EtsyApiError);
    await vi.runAllTimersAsync();
    await assertion;
    // 1 initial attempt + 3 retries = 4 calls
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
