import { describe, expect, it } from "vitest";
import { parseStaticFxRates, resolveShopPrice } from "./currency.js";

describe("resolveShopPrice", () => {
  it("passes USD shops through unchanged (identity)", () => {
    const result = resolveShopPrice(9.99, "USD", {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolution.priceInShopCurrency).toBe(9.99);
      expect(result.resolution.fxSource).toBe("identity");
      expect(result.resolution.fxRate).toBe(1);
    }
  });

  it("converts using a configured static rate for a non-USD shop", () => {
    const result = resolveShopPrice(10, "EUR", { EUR: 0.92 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolution.priceInShopCurrency).toBe(9.2);
      expect(result.resolution.fxSource).toBe("static_config");
      expect(result.resolution.shopCurrencyCode).toBe("EUR");
    }
  });

  it("hard-blocks a non-USD shop with no configured FX rate, rather than silently mis-pricing", () => {
    const result = resolveShopPrice(4.99, "TRY", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/TRY/);
      expect(result.reason).toMatch(/FX_STATIC_RATES/);
      expect(result.auditDetails.shopCurrencyCode).toBe("TRY");
      expect(result.auditDetails.basePriceUsd).toBe(4.99);
    }
  });

  it("is case-insensitive on currency codes", () => {
    const result = resolveShopPrice(10, "eur", { EUR: 0.92 });
    expect(result.ok).toBe(true);
  });
});

describe("parseStaticFxRates", () => {
  it("returns an empty object for an empty/unset string", () => {
    expect(parseStaticFxRates("")).toEqual({});
    expect(parseStaticFxRates("   ")).toEqual({});
  });

  it("parses a valid JSON rate map, uppercasing keys", () => {
    expect(parseStaticFxRates('{"eur":0.92,"gbp":0.79}')).toEqual({ EUR: 0.92, GBP: 0.79 });
  });

  it("silently drops non-numeric or non-positive entries rather than crashing", () => {
    expect(parseStaticFxRates('{"EUR":0.92,"BAD":"nope","ZERO":0,"NEG":-1}')).toEqual({ EUR: 0.92 });
  });

  it("returns an empty object for malformed JSON rather than throwing", () => {
    expect(parseStaticFxRates("{not json")).toEqual({});
  });
});
