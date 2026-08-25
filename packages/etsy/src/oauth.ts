import { createHash, randomBytes } from "node:crypto";
import {
  DEFAULT_OAUTH_SCOPES,
  ETSY_OAUTH_AUTHORIZE_URL,
  ETSY_OAUTH_TOKEN_URL,
  PKCE_METHOD,
} from "./constants.js";

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

/** Generates an Etsy-compliant PKCE pair: verifier is 43-128 chars of [A-Za-z0-9._~-]. */
export function generatePkcePair(): PkcePair {
  const codeVerifier = base64UrlEncode(randomBytes(64)).slice(0, 128);
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(32));
}

export interface BuildAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
}

/** Builds the URL the user (you) opens to grant this app access to your Etsy shop. */
export function buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const scopes = input.scopes ?? DEFAULT_OAUTH_SCOPES;
  const url = new URL(ETSY_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", PKCE_METHOD);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface ExchangeCodeInput {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export class EtsyOAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "EtsyOAuthError";
  }
}

/** Exchanges an authorization code (from the OAuth callback) for an access/refresh token pair. */
export async function exchangeCodeForToken(input: ExchangeCodeInput): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });
  return postTokenRequest(body);
}

export interface RefreshTokenInput {
  clientId: string;
  refreshToken: string;
}

/** Exchanges a refresh token for a new access/refresh token pair. Etsy rotates the refresh token on every use. */
export async function refreshAccessToken(input: RefreshTokenInput): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    refresh_token: input.refreshToken,
  });
  return postTokenRequest(body);
}

async function postTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(ETSY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new EtsyOAuthError(
      `Etsy OAuth token request failed: ${res.status} ${(json.error_description as string) ?? (json.error as string) ?? ""}`,
      res.status,
      json,
    );
  }
  return json as unknown as TokenResponse;
}

/** Extracts the numeric Etsy user id, which is the prefix of the access token before the leading dot. */
export function extractUserIdFromAccessToken(accessToken: string): string {
  const [userId] = accessToken.split(".");
  if (!userId) throw new Error("Malformed Etsy access token: expected `{user_id}.{token}` format.");
  return userId;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
