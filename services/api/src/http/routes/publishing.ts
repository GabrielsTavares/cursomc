import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppServices } from "../create-app.js";
import { createRequireAuth } from "../plugins/auth.js";
import { ValidationError } from "../../domain/errors.js";

const scheduleBody = z.object({
  episodeId: z.string().uuid(),
  targets: z
    .array(
      z.object({
        socialAccountId: z.string().uuid(),
        scheduledAt: z.string().min(1),
        caption: z.string().optional(),
      }),
    )
    .min(1),
});

const markBody = z.object({
  externalPostId: z.string().optional(),
});

export async function registerPublishingRoutes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  const requireAuth = createRequireAuth(services);

  app.get(
    "/api/v1/projects/:id/publications",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const publications = await services.listPublications.execute(request.userId!, id);
      return { publications };
    },
  );

  app.post(
    "/api/v1/projects/:id/publications",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = scheduleBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Pedido de agendamento inválido", parsed.error.flatten());
      }
      const publications = await services.createSchedule.execute(
        request.userId!,
        id,
        parsed.data,
      );
      return reply.code(201).send({ publications });
    },
  );

  app.post(
    "/api/v1/projects/:id/publications/:publicationId/cancel",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id, publicationId } = request.params as { id: string; publicationId: string };
      const publication = await services.cancelPublication.execute(
        request.userId!,
        id,
        publicationId,
      );
      return { publication };
    },
  );

  app.post(
    "/api/v1/projects/:id/publications/:publicationId/retry",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id, publicationId } = request.params as { id: string; publicationId: string };
      const publication = await services.retryPublication.execute(
        request.userId!,
        id,
        publicationId,
      );
      return { publication };
    },
  );

  app.post(
    "/api/v1/projects/:id/publications/:publicationId/publish-now",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id, publicationId } = request.params as { id: string; publicationId: string };
      const publication = await services.publishNow.execute(
        request.userId!,
        id,
        publicationId,
      );
      return { publication };
    },
  );

  app.post(
    "/api/v1/projects/:id/publications/:publicationId/mark-published",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id, publicationId } = request.params as { id: string; publicationId: string };
      const parsed = markBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Body inválido", parsed.error.flatten());
      }
      const publication = await services.markPublished.execute(
        request.userId!,
        id,
        publicationId,
        parsed.data.externalPostId,
      );
      return { publication };
    },
  );
}
