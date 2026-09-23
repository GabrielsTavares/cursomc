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
}
