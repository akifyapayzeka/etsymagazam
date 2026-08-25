import { encryptSecret, loadEnv } from "@etsymagazam/core";
import { CANONICAL_SHOP_ID, getCanonicalShop, prisma } from "@etsymagazam/database";
import {
  buildAuthorizeUrl,
  DEFAULT_OAUTH_SCOPES,
  EtsyApiClient,
  exchangeCodeForToken,
  extractUserIdFromAccessToken,
  generatePkcePair,
  generateState,
} from "@etsymagazam/etsy";
import type { FastifyInstance } from "fastify";

const OAUTH_COOKIE = "etsy_oauth_pkce";

export default async function etsyOauthRoutes(app: FastifyInstance) {
  /** Step 1 (human-triggered from the dashboard): redirects you to Etsy's consent screen. */
  app.get("/api/etsy/oauth/start", { preHandler: app.requireAuth }, async (req, reply) => {
    const env = loadEnv();
    if (!env.ETSY_API_KEYSTRING || !env.ETSY_SHARED_SECRET) {
      reply.code(500);
      return { error: "etsy_not_configured", message: "Set ETSY_API_KEYSTRING and ETSY_SHARED_SECRET in your .env first — see docs/ETSY_SETUP.md." };
    }

    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateState();

    reply.setCookie(OAUTH_COOKIE, JSON.stringify({ state, codeVerifier }), {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/etsy/oauth",
      maxAge: 60 * 10,
    });

    const url = buildAuthorizeUrl({
      clientId: env.ETSY_API_KEYSTRING,
      redirectUri: env.ETSY_OAUTH_REDIRECT_URI,
      state,
      codeChallenge,
      scopes: env.ETSY_OAUTH_SCOPES.split(",").map((s) => s.trim()) as unknown as typeof DEFAULT_OAUTH_SCOPES,
    });

    return { authorizeUrl: url };
  });

  /** Step 2: Etsy redirects the browser back here after you approve access. */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/api/etsy/oauth/callback",
    async (req, reply) => {
      const env = loadEnv();
      const { code, state, error } = req.query;

      if (error) {
        reply.code(400);
        return { error: "etsy_denied", message: `Etsy returned an error: ${error}` };
      }
      if (!code || !state) {
        reply.code(400);
        return { error: "missing_code_or_state" };
      }

      const raw = req.cookies[OAUTH_COOKIE];
      if (!raw) {
        reply.code(400);
        return { error: "missing_pkce_cookie", message: "OAuth session expired — start the connection again from the dashboard." };
      }
      const { state: expectedState, codeVerifier } = JSON.parse(raw) as { state: string; codeVerifier: string };
      if (state !== expectedState) {
        reply.code(400);
        return { error: "state_mismatch", message: "Possible CSRF attempt — OAuth state did not match." };
      }
      reply.clearCookie(OAUTH_COOKIE, { path: "/api/etsy/oauth" });

      const tokenResponse = await exchangeCodeForToken({
        clientId: env.ETSY_API_KEYSTRING,
        redirectUri: env.ETSY_OAUTH_REDIRECT_URI,
        code,
        codeVerifier,
      });

      const userId = extractUserIdFromAccessToken(tokenResponse.access_token);

      const tempClient = new EtsyApiClient({
        apiKeystring: env.ETSY_API_KEYSTRING,
        sharedSecret: env.ETSY_SHARED_SECRET,
        shopId: "pending",
        tokenProvider: { getAccessToken: async () => tokenResponse.access_token },
      });
      const shops = await tempClient.getShopsByOwnerUserId(userId);
      const etsyShop = shops.results[0];
      if (!etsyShop) {
        reply.code(400);
        return { error: "no_shop_found", message: "This Etsy account has no shop. Open your shop on Etsy first, then retry." };
      }

      // This system manages exactly one shop — always write onto the fixed
      // canonical row (seeded by packages/database/src/seed.ts) rather than
      // upserting by etsyShopId. Upserting by etsyShopId would create a
      // SECOND Shop row on first connect (the seeded row's etsyShopId is
      // still null at that point, so it wouldn't match), leaving one
      // orphaned placeholder row and one real row — every other findFirst()
      // call in the codebase would then be reading an arbitrary one of the
      // two.
      const existingOtherShopWithThisEtsyId = await prisma.shop.findUnique({
        where: { etsyShopId: String(etsyShop.shop_id) },
      });
      if (existingOtherShopWithThisEtsyId && existingOtherShopWithThisEtsyId.id !== CANONICAL_SHOP_ID) {
        reply.code(500);
        return {
          error: "shop_id_conflict",
          message: "This Etsy shop is already linked to a different internal shop record. This should not happen in a single-shop deployment — check the database for duplicate Shop rows.",
        };
      }

      const shop = await prisma.shop.upsert({
        where: { id: CANONICAL_SHOP_ID },
        update: { etsyShopId: String(etsyShop.shop_id), shopName: etsyShop.shop_name, currencyCode: etsyShop.currency_code },
        create: {
          id: CANONICAL_SHOP_ID,
          etsyShopId: String(etsyShop.shop_id),
          shopName: etsyShop.shop_name,
          currencyCode: etsyShop.currency_code,
        },
      });

      await prisma.etsyConnection.updateMany({
        where: { shopId: shop.id, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      });

      await prisma.etsyConnection.create({
        data: {
          shopId: shop.id,
          accessTokenEnc: encryptSecret(tokenResponse.access_token),
          refreshTokenEnc: encryptSecret(tokenResponse.refresh_token),
          scopes: env.ETSY_OAUTH_SCOPES.split(",").map((s) => s.trim()),
          expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
          lastVerifiedAt: new Date(),
        },
      });

      // isPaused defaults to false in the schema (see AutopilotState in
      // schema.prisma) — that default is fine for local/dev seeding, but a
      // freshly-connected production shop must start PAUSED, never live by
      // accident the moment OAuth completes. Set it explicitly here rather
      // than relying on the schema default.
      await prisma.autopilotState.upsert({
        where: { shopId: shop.id },
        update: {},
        create: { shopId: shop.id, isPaused: true, pausedReason: "Default state after first Etsy OAuth connect — enable explicitly when ready." },
      });

      reply.redirect(`${env.DASHBOARD_BASE_URL}/settings?etsy_connected=1`);
      return reply;
    },
  );

  /** Verifies the connection actually works end-to-end (ping + shop lookup + capability check) — run this before the first real publish. */
  app.post("/api/etsy/oauth/verify", { preHandler: app.requireAuth }, async (_req, reply) => {
    const env = loadEnv();
    const shop = await getCanonicalShop();
    if (!shop.etsyShopId) {
      reply.code(400);
      return { error: "not_connected" };
    }

    const { PrismaAccessTokenProvider } = await import("../lib/token-provider.js");
    const client = new EtsyApiClient({
      apiKeystring: env.ETSY_API_KEYSTRING,
      sharedSecret: env.ETSY_SHARED_SECRET,
      shopId: shop.etsyShopId,
      tokenProvider: new PrismaAccessTokenProvider(),
    });

    const ping = await client.ping().catch((e: Error) => ({ error: e.message }));
    const shopInfo = await client.getShop(shop.etsyShopId).catch((e: Error) => ({ error: e.message }));

    return {
      ping,
      shop: shopInfo,
      remainingDailyQuota: client.remainingDailyQuota,
    };
  });
}
