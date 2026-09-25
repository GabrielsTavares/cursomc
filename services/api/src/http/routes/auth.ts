import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppServices } from "../create-app.js";
import { createRequireAuth } from "../plugins/auth.js";
import { ValidationError } from "../../domain/errors.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  const requireAuth = createRequireAuth(services);

  app.post(
    "/api/v1/auth/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = loginBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid login payload", parsed.error.flatten());
      }

      const result = await services.login.execute(parsed.data);
      reply.setCookie(services.config.COOKIE_NAME, result.token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: services.config.COOKIE_SECURE,
      });

      return {
        user: result.user,
        accessToken: result.token,
      };
    },
  );

  app.post(
    "/api/v1/auth/logout",
    { preHandler: requireAuth },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.clearCookie(services.config.COOKIE_NAME, { path: "/" });
      return { ok: true };
    },
  );

  app.get(
    "/api/v1/auth/me",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const userId = request.userId!;
      const user = await services.getCurrentUser.execute(userId);
      return { user };
    },
  );
}
