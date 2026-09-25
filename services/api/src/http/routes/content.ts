import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import type { AppServices } from "../create-app.js";
import { createRequireAuth } from "../plugins/auth.js";
import { ValidationError } from "../../domain/errors.js";

const createEpisodeBody = z.object({
  title: z.string().min(1),
  contentKind: z.enum(["VIDEO", "IMAGE", "CAROUSEL"]),
  locale: z.string().min(2).optional(),
  hook: z.string().optional(),
  description: z.string().optional(),
  targetDurationSeconds: z.number().int().positive().optional(),
});

async function readUploadFile(
  request: FastifyRequest,
  maxBytes: number,
): Promise<{ filename: string | null; mimeType: string; body: Buffer }> {
  const file = await request.file();
  if (!file) {
    throw new ValidationError("Envia um ficheiro no campo “file” (multipart).");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of file.file) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new ValidationError(
        `Ficheiro demasiado grande (máx. ${Math.round(maxBytes / (1024 * 1024))} MB).`,
      );
    }
    chunks.push(Buffer.from(chunk));
  }
  if (file.file.truncated) {
    throw new ValidationError("Upload interrompido — tenta de novo.");
  }
  return {
    filename: file.filename || null,
    mimeType: file.mimetype || "application/octet-stream",
    body: Buffer.concat(chunks),
  };
}

export async function registerContentRoutes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  const requireAuth = createRequireAuth(services);
  const maxUpload = Math.max(
    services.config.MEDIA_MAX_IMAGE_BYTES,
    services.config.MEDIA_MAX_VIDEO_BYTES,
  );

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: maxUpload,
    },
  });

  app.get(
    "/api/v1/projects/:id/episodes",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const episodes = await services.listEpisodes.execute(request.userId!, id);
      return { episodes };
    },
  );

  app.post(
    "/api/v1/projects/:id/episodes",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = createEpisodeBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Dados de conteúdo inválidos", parsed.error.flatten());
      }
      const episode = await services.createEpisode.execute(request.userId!, id, parsed.data);
      return reply.code(201).send({ episode });
    },
  );

  app.delete(
    "/api/v1/projects/:id/episodes/:episodeId",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, episodeId } = request.params as { id: string; episodeId: string };
      await services.deleteEpisode.execute(request.userId!, id, episodeId);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/v1/projects/:id/episodes/:episodeId/media",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id, episodeId } = request.params as { id: string; episodeId: string };
      const media = await services.listEpisodeMedia.execute(request.userId!, id, episodeId);
      return { media };
    },
  );

  app.post(
    "/api/v1/projects/:id/episodes/:episodeId/media",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, episodeId } = request.params as { id: string; episodeId: string };
      const upload = await readUploadFile(request, maxUpload);
      const media = await services.uploadEpisodeMedia.execute(
        request.userId!,
        id,
        episodeId,
        upload,
      );
      return reply.code(201).send({ media });
    },
  );

  app.get(
    "/api/v1/projects/:id/media",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const media = await services.listProjectMedia.execute(request.userId!, id);
      return { media };
    },
  );

  app.delete(
    "/api/v1/projects/:id/media/:mediaId",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, mediaId } = request.params as { id: string; mediaId: string };
      await services.deleteMediaAsset.execute(request.userId!, id, mediaId);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/v1/projects/:id/media/:mediaId/file",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, mediaId } = request.params as { id: string; mediaId: string };
      const file = await services.getMediaFile.execute(request.userId!, id, mediaId);
      reply.header("Content-Type", file.mime);
      if (file.filename) {
        reply.header(
          "Content-Disposition",
          `inline; filename="${file.filename.replace(/"/g, "")}"`,
        );
      }
      return reply.send(createReadStream(file.absolutePath));
    },
  );
}
