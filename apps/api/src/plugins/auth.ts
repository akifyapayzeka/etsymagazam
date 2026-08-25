import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { verifySessionToken } from "../lib/session.js";

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;

declare module "fastify" {
  interface FastifyRequest {
    adminEmail?: string;
  }
  interface FastifyInstance {
    requireAuth: PreHandler;
    requireCsrf: PreHandler;
  }
}

const SESSION_COOKIE = "etsy_autopilot_session";
const CSRF_COOKIE = "etsy_autopilot_csrf";

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("adminEmail", undefined);

  app.decorate("requireAuth", async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    const session = verifySessionToken(token);
    if (!session) {
      reply.code(401).send({ error: "unauthenticated" });
      return reply;
    }
    req.adminEmail = session.email;
  });

  app.decorate("requireCsrf", async (req: FastifyRequest, reply: FastifyReply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const cookieToken = req.cookies[CSRF_COOKIE];
    const headerToken = req.headers["x-csrf-token"];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      reply.code(403).send({ error: "csrf_check_failed" });
      return reply;
    }
  });
});

export const COOKIE_NAMES = { SESSION: SESSION_COOKIE, CSRF: CSRF_COOKIE };
