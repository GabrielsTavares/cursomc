import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../../domain/errors.js";
import type { AppServices } from "../create-app.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export function createRequireAuth(services: AppServices) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
    const cookieToken = request.cookies?.[services.config.COOKIE_NAME];
    const header = request.headers.authorization;
    const bearer =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice("Bearer ".length).trim()
        : undefined;
    const token = bearer || cookieToken;
    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    try {
      const payload = await services.tokens.verify(token);
      request.userId = payload.sub;
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
  };
}
