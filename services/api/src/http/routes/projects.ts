import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppServices } from "../create-app.js";
import { createRequireAuth } from "../plugins/auth.js";
import { ValidationError } from "../../domain/errors.js";

const projectTypeSchema = z.enum(["CREATOR", "PET", "AFFILIATE", "BRAND", "OTHER"]);

const createBody = z.object({
  name: z.string().min(1),
  projectType: projectTypeSchema.optional(),
  localeDefault: z.string().min(2).optional(),
  enabledModules: z.array(z.string()).optional(),
});

const updateBody = z.object({
  name: z.string().min(1).optional(),
  projectType: projectTypeSchema.optional(),
  localeDefault: z.string().min(2).optional(),
  enabledModules: z.array(z.string()).optional(),
});

const platformSchema = z.enum([
  "TIKTOK",
  "INSTAGRAM",
  "YOUTUBE",
  "KWAI",
  "FACEBOOK",
  "OTHER",
]);

const statusSchema = z.enum(["CONNECTED", "NEEDS_CREDENTIALS", "MANUAL"]);

const credentialsSchema = z
  .object({
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    apiKey: z.string().optional(),
    extraJson: z.string().optional(),
  })
  .optional();

const createSocialBody = z.object({
  platform: platformSchema,
  displayName: z.string().min(1),
  status: statusSchema.optional(),
  externalAccountId: z.string().optional(),
  credentials: credentialsSchema,
});

const updateSocialBody = z.object({
  displayName: z.string().min(1).optional(),
  status: statusSchema.optional(),
  externalAccountId: z.string().nullable().optional(),
  credentials: credentialsSchema,
});

export async function registerProjectRoutes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  const requireAuth = createRequireAuth(services);

  app.get(
    "/api/v1/projects",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const projects = await services.listProjects.execute(request.userId!);
      return { projects };
    },
  );

  app.post(
    "/api/v1/projects",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid project payload", parsed.error.flatten());
      }
      const project = await services.createProject.execute(request.userId!, {
        name: parsed.data.name,
        projectType: parsed.data.projectType,
        localeDefault: parsed.data.localeDefault,
        enabledModules: parsed.data.enabledModules,
      });
      return reply.code(201).send({ project });
    },
  );

  app.get(
    "/api/v1/projects/:id",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const project = await services.getProject.execute(request.userId!, id);
      return { project };
    },
  );

  app.patch(
    "/api/v1/projects/:id",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const parsed = updateBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid project payload", parsed.error.flatten());
      }
      const project = await services.updateProject.execute(request.userId!, id, {
        name: parsed.data.name,
        projectType: parsed.data.projectType,
        localeDefault: parsed.data.localeDefault,
        enabledModules: parsed.data.enabledModules,
      });
      return { project };
    },
  );

  app.delete(
    "/api/v1/projects/:id",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await services.deleteProject.execute(request.userId!, id);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/v1/projects/:id/social-accounts",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const socialAccounts = await services.listSocialAccounts.execute(request.userId!, id);
      return { socialAccounts };
    },
  );

  app.post(
    "/api/v1/projects/:id/social-accounts",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = createSocialBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid social account payload", parsed.error.flatten());
      }
      const socialAccount = await services.createSocialAccount.execute(request.userId!, id, {
        platform: parsed.data.platform,
        displayName: parsed.data.displayName,
        status: parsed.data.status,
        externalAccountId: parsed.data.externalAccountId,
        credentials: parsed.data.credentials,
      });
      return reply.code(201).send({ socialAccount });
    },
  );

  app.patch(
    "/api/v1/projects/:id/social-accounts/:accountId",
    { preHandler: requireAuth },
    async (request: FastifyRequest) => {
      const { id, accountId } = request.params as { id: string; accountId: string };
      const parsed = updateSocialBody.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Invalid social account payload", parsed.error.flatten());
      }
      const socialAccount = await services.updateSocialAccount.execute(
        request.userId!,
        id,
        accountId,
        {
          displayName: parsed.data.displayName,
          status: parsed.data.status,
          externalAccountId: parsed.data.externalAccountId,
          credentials: parsed.data.credentials,
        },
      );
      return { socialAccount };
    },
  );

  app.delete(
    "/api/v1/projects/:id/social-accounts/:accountId",
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, accountId } = request.params as { id: string; accountId: string };
      await services.deleteSocialAccount.execute(request.userId!, id, accountId);
      return reply.code(204).send();
    },
  );
}
