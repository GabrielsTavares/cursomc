import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppServices } from "../create-app.js";
import { checkDatabase } from "../../infrastructure/db/client.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    const databaseUp = await checkDatabase(services.pool);
    const status = databaseUp ? "ok" : "degraded";
    return reply.code(databaseUp ? 200 : 503).send({
      status,
      service: "creator-hub-api",
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseUp ? "up" : "down",
      },
    });
  });
}
