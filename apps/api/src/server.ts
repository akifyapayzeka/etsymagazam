import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@etsymagazam/core";
import Fastify from "fastify";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import etsyOauthRoutes from "./routes/etsy-oauth.js";
import etsyWebhookRoutes from "./routes/etsy-webhooks.js";
import healthRoutes from "./routes/health.js";
import opportunityRoutes from "./routes/opportunities.js";

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-api-key"]', "req.headers['webhook-signature']"],
        censor: "[REDACTED]",
      },
    },
  });

  await app.register(cors, {
    origin: env.DASHBOARD_BASE_URL,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(etsyOauthRoutes);
  await app.register(etsyWebhookRoutes);
  await app.register(dashboardRoutes);
  await app.register(opportunityRoutes);

  return app;
}
