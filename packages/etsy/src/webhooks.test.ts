import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature, WebhookVerificationError } from "./webhooks.js";

function sign(secretRaw: Buffer, id: string, ts: string, body: string): string {
  const sig = createHmac("sha256", secretRaw).update(`${id}.${ts}.${body}`).digest("base64");
  return `v1,${sig}`;
}

describe("verifyWebhookSignature", () => {
  const secretBytes = Buffer.from("test-signing-secret-bytes-123456");
  const signingSecret = `whsec_${secretBytes.toString("base64")}`;

  it("accepts a correctly signed payload", () => {
    const id = "msg_123";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 1 });
    const signature = sign(secretBytes, id, ts, body);

    expect(() =>
      verifyWebhookSignature(body, { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": signature }, signingSecret),
    ).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const id = "msg_123";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 1 });
    const signature = sign(secretBytes, id, ts, body);
    const tamperedBody = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 999 });

    expect(() =>
      verifyWebhookSignature(
        tamperedBody,
        { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": signature },
        signingSecret,
      ),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const id = "msg_123";
    const ts = String(Math.floor(Date.now() / 1000) - 10_000);
    const body = JSON.stringify({ event_type: "order.paid", resource_url: "https://api.etsy.com/x", shop_id: 1 });
    const signature = sign(secretBytes, id, ts, body);

    expect(() =>
      verifyWebhookSignature(body, { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": signature }, signingSecret),
    ).toThrow(/tolerance/i);
  });

  it("rejects when signature header is missing", () => {
    expect(() =>
      verifyWebhookSignature("{}", { "webhook-id": "a", "webhook-timestamp": "1", "webhook-signature": "" }, signingSecret),
    ).toThrow(WebhookVerificationError);
  });
});
