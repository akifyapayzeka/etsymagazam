import { createHmac, timingSafeEqual } from "node:crypto";
import { WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS, type EtsyWebhookEventType } from "./constants.js";

export interface EtsyWebhookHeaders {
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}

export interface EtsyWebhookPayload {
  event_type: EtsyWebhookEventType;
  resource_url: string;
  shop_id: number;
}

export class WebhookVerificationError extends Error {}

/**
 * Verifies an Etsy webhook delivery using the Standard-Webhooks-style scheme
 * documented at developer.etsy.com/documentation/essentials/webhooks:
 *
 *   signed_content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *   expected = base64(HMAC_SHA256(base64_decode(secret.replace('whsec_', '')), signed_content))
 *   header value is `v1,{expected}` (comma-separated if multiple signatures are present)
 *
 * `rawBody` MUST be the exact bytes received (verify before JSON.parse-ing).
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  headers: EtsyWebhookHeaders,
  signingSecret: string,
): void {
  const webhookId = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!webhookId || !timestamp || !signatureHeader) {
    throw new WebhookVerificationError("Missing required webhook signature headers.");
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError("Webhook timestamp outside acceptable tolerance window (possible replay).");
  }

  const secretRaw = signingSecret.startsWith("whsec_") ? signingSecret.slice("whsec_".length) : signingSecret;
  const secretBytes = Buffer.from(secretRaw, "base64");

  const bodyString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signedContent = `${webhookId}.${timestamp}.${bodyString}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((v): v is string => Boolean(v));

  const matches = candidates.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });

  if (!matches) {
    throw new WebhookVerificationError("Webhook signature mismatch — payload may have been tampered with.");
  }
}

export function parseWebhookPayload(rawBody: string | Buffer): EtsyWebhookPayload {
  const bodyString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return JSON.parse(bodyString) as EtsyWebhookPayload;
}
