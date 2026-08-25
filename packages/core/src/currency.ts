/**
 * Currency safety for Etsy listing prices.
 *
 * Every internally computed price (product-catalog.json's `basePriceUsd`,
 * the `MIN_PRICE`/`MAX_PRICE` env bounds, the Pricing Agent's price-test
 * deltas) is denominated in `BASE_PRICING_CURRENCY`. Etsy's `price` field on
 * a listing write has no currency parameter of its own — Etsy silently
 * interprets whatever number you send as an amount in the *shop's* currency
 * (`Shop.currency_code`). Sending a USD-denominated number straight through
 * to a non-USD shop would silently mis-price every listing (e.g. a €4.99
 * intent becomes a real ₺4.99 charge). This module is the one place that
 * decision gets made, so it can never happen by omission at a call site.
 */

export const BASE_PRICING_CURRENCY = "USD" as const;

export interface FxResolution {
  /** The price to actually send to Etsy's write endpoint, in the shop's currency. */
  priceInShopCurrency: number;
  shopCurrencyCode: string;
  basePriceUsd: number;
  fxRate: number;
  fxSource: "identity" | "static_config";
}

export type FxResult = { ok: true; resolution: FxResolution } | { ok: false; reason: string; auditDetails: Record<string, unknown> };

/**
 * Resolves a USD-denominated internal price into the shop's real currency.
 *
 * - Shop currency is USD: identity, no conversion needed.
 * - Shop currency isn't USD and an operator has configured a static rate for
 *   it (via `FX_STATIC_RATES`): converts using that rate.
 * - Otherwise: refuses (`ok: false`) rather than guessing an exchange rate.
 *   This is a deliberate hard-block, not a bug — publishing blocked on
 *   missing FX config is exactly as intentional as publishing blocked on a
 *   missing taxonomy_id (see docs/ETSY_SETUP.md step 6).
 */
export function resolveShopPrice(
  priceUsd: number,
  shopCurrencyCode: string,
  staticRates: Record<string, number> = {},
): FxResult {
  const shopCurrency = shopCurrencyCode.toUpperCase();

  if (shopCurrency === BASE_PRICING_CURRENCY) {
    return {
      ok: true,
      resolution: {
        priceInShopCurrency: priceUsd,
        shopCurrencyCode: shopCurrency,
        basePriceUsd: priceUsd,
        fxRate: 1,
        fxSource: "identity",
      },
    };
  }

  const rate = staticRates[shopCurrency];
  if (typeof rate === "number" && rate > 0) {
    return {
      ok: true,
      resolution: {
        priceInShopCurrency: Math.round(priceUsd * rate * 100) / 100,
        shopCurrencyCode: shopCurrency,
        basePriceUsd: priceUsd,
        fxRate: rate,
        fxSource: "static_config",
      },
    };
  }

  return {
    ok: false,
    reason: `Shop currency is ${shopCurrency}, but all pricing config (product-catalog.json, MIN_PRICE/MAX_PRICE) is denominated in ${BASE_PRICING_CURRENCY} and no FX rate is configured for ${shopCurrency}. Set FX_STATIC_RATES in .env (e.g. {"EUR":0.92}) to enable publishing to this shop, or leave it unset to keep this hard-blocked rather than mis-pricing listings.`,
    auditDetails: { basePriceUsd: priceUsd, shopCurrencyCode: shopCurrency, basePricingCurrency: BASE_PRICING_CURRENCY, configuredRates: Object.keys(staticRates) },
  };
}

/** Parses the `FX_STATIC_RATES` env var (a JSON object string, e.g. `{"EUR":0.92,"GBP":0.79}`). Empty/unset means no rates configured — non-USD shops hard-block. */
export function parseStaticFxRates(raw: string): Record<string, number> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && value > 0) out[key.toUpperCase()] = value;
    }
    return out;
  } catch {
    return {};
  }
}
