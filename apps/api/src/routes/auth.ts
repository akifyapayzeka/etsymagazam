import { loadEnv } from "@etsymagazam/core";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { COOKIE_NAMES } from "../plugins/auth.js";
import { createSessionToken, generateCsrfToken, verifySessionToken } from "../lib/session.js";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: "invalid_request" };
      }
      const env = loadEnv();
      const { email, password } = parsed.data;

      if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH) {
        reply.code(500);
        return { error: "admin_not_configured", message: "Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in your .env." };
      }

      const emailMatches = email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
      const passwordMatches = await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH).catch(() => false);

      if (!emailMatches || !passwordMatches) {
        reply.code(401);
        return { error: "invalid_credentials" };
      }

      const sessionToken = createSessionToken(env.ADMIN_EMAIL);
      const csrfToken = generateCsrfToken();
      const isProd = env.NODE_ENV === "production";

      reply
        .setCookie(COOKIE_NAMES.SESSION, sessionToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 12,
        })
        .setCookie(COOKIE_NAMES.CSRF, csrfToken, {
          httpOnly: false,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 12,
        });

      return { ok: true, csrfToken };
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    reply.clearCookie(COOKIE_NAMES.SESSION, { path: "/" }).clearCookie(COOKIE_NAMES.CSRF, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const session = verifySessionToken(req.cookies[COOKIE_NAMES.SESSION]);
    if (!session) {
      reply.code(401);
      return { error: "unauthenticated" };
    }
    return { email: session.email };
  });
}
