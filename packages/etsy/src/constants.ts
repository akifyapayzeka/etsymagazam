/**
 * Etsy Open API v3 constants, verified against the official docs at
 * https://developer.etsy.com/documentation/ (checked 2026-08-25).
 *
 * Etsy changes these values from time to time. Before going live, or if the
 * Publisher Agent starts getting unexpected 4xx errors, re-check this page
 * against the live docs and bump `DOCS_LAST_VERIFIED`.
 */
export const DOCS_LAST_VERIFIED = "2026-08-25";

export const ETSY_API_BASE_URL = "https://api.etsy.com/v3/application";
export const ETSY_OAUTH_AUTHORIZE_URL = "https://www.etsy.com/oauth/connect";
export const ETSY_OAUTH_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
export const ETSY_PING_PATH = "/openapi-ping";

/** Etsy requires PKCE (S256) on every authorization code flow request. */
export const PKCE_METHOD = "S256" as const;

/** Access tokens are short-lived; refresh proactively before this elapses. */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 3600;
/** Etsy refresh tokens are valid for 90 days from issuance. */
export const REFRESH_TOKEN_LIFETIME_DAYS = 90;

/** Default per-app rate limits (standard tier). Confirm your app's actual quota in the Developer Portal. */
export const RATE_LIMITS = {
  queriesPerSecond: 10,
  queriesPerDay: 10_000,
  /** The shop receipts endpoint additionally throttles to ~1 request/second/shop. */
  receiptsPerSecondPerShop: 1,
} as const;

/** Etsy listing constraints as of DOCS_LAST_VERIFIED — re-verify before relying on these. */
export const LISTING_LIMITS = {
  maxTags: 13,
  maxTagLength: 20,
  maxTitleLength: 140,
  maxImages: 10,
  maxDigitalFiles: 5,
  maxDigitalFileSizeBytes: 20 * 1024 * 1024, // 20MB per file
  maxDigitalFilesTotalSizeBytes: 100 * 1024 * 1024, // 100MB per listing
} as const;

/** Order-related webhook event types Etsy currently supports (Developer Portal → Webhooks). */
export const SUPPORTED_WEBHOOK_EVENTS = ["order.paid", "order.canceled", "order.shipped", "order.delivered"] as const;
export type EtsyWebhookEventType = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];

/** Standard-Webhooks-style replay protection window (Etsy rejects/we should reject beyond this). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export const DEFAULT_OAUTH_SCOPES = [
  "listings_r",
  "listings_w",
  "listings_d",
  "shops_r",
  "shops_w",
  "transactions_r",
  "transactions_w",
  "profile_r",
] as const;
