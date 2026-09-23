import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import type { AppConfig } from "../infrastructure/config.js";
import { createDb } from "../infrastructure/db/client.js";
import {
  DrizzleProjectRepository,
  DrizzleUserRepository,
} from "../infrastructure/db/repositories.js";
import {
  Argon2PasswordHasher,
  JoseJwtTokenService,
} from "../infrastructure/auth/security.js";
import { GetCurrentUserUseCase, LoginUseCase } from "../application/auth-use-cases.js";
import {
  CreateProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from "../application/project-use-cases.js";
import {
  DomainError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../domain/errors.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import type { TokenService } from "../application/ports.js";

export interface AppServices {
  config: AppConfig;
  pool: ReturnType<typeof createDb>["pool"];
  tokens: TokenService;
  login: LoginUseCase;
  getCurrentUser: GetCurrentUserUseCase;
  listProjects: ListProjectsUseCase;
  createProject: CreateProjectUseCase;
  getProject: GetProjectUseCase;
  updateProject: UpdateProjectUseCase;
}

export async function createApp(config: AppConfig) {
  const { db, pool } = createDb(config.DATABASE_URL);

  const users = new DrizzleUserRepository(db);
  const projects = new DrizzleProjectRepository(db);
  const hasher = new Argon2PasswordHasher();
  const tokens = new JoseJwtTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN);

  const services: AppServices = {
    config,
    pool,
    tokens,
    login: new LoginUseCase(users, hasher, tokens),
    getCurrentUser: new GetCurrentUserUseCase(users),
    listProjects: new ListProjectsUseCase(projects),
    createProject: new CreateProjectUseCase(projects),
    getProject: new GetProjectUseCase(projects),
    updateProject: new UpdateProjectUseCase(projects),
  };

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: [
          "password",
          "req.headers.authorization",
          "req.headers.cookie",
          "DATABASE_URL",
          "JWT_SECRET",
          "SEED_USER_PASSWORD",
        ],
        censor: "[Redacted]",
      },
    },
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }
    if (error instanceof UnauthorizedError) {
      return reply.code(401).send({ code: error.code, message: error.message });
    }
    if (error instanceof NotFoundError) {
      return reply.code(404).send({ code: error.code, message: error.message });
    }
    if (error instanceof DomainError) {
      return reply.code(400).send({ code: error.code, message: error.message });
    }

    request.log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  });

  await registerHealthRoutes(app, services);
  await registerAuthRoutes(app, services);
  await registerProjectRoutes(app, services);

  return { app, services, pool };
}
