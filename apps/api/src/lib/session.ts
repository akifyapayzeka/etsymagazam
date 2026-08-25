import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@etsymagazam/core";

export interface SessionPayload {
  email: string;
  iat: number;
  exp: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Stateless signed-cookie session (HMAC-SHA256) — no server-side session store needed for a single-admin app. */
export function createSessionToken(email: string): string {
  const env = loadEnv();
  const payload: SessionPayload = { email, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", env.SESSION_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const env = loadEnv();
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSig = createHmac("sha256", env.SESSION_SECRET).update(payloadB64).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}
