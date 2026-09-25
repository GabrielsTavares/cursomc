import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import type { AppConfig } from "../infrastructure/config.js";
import { createDb } from "../infrastructure/db/client.js";
import {
  DrizzleEpisodeRepository,
  DrizzleMediaAssetRepository,
  DrizzleProjectRepository,
  DrizzleSocialAccountRepository,
  DrizzleUserRepository,
} from "../infrastructure/db/repositories.js";
import {
  Argon2PasswordHasher,
  JoseJwtTokenService,
} from "../infrastructure/auth/security.js";
import { AesGcmCredentialVault } from "../infrastructure/security/credential-vault.js";
import { ManualPublisher } from "../infrastructure/publishers/manual-publisher.js";
import { LocalMediaStorage } from "../infrastructure/media/local-media-storage.js";
import { GetCurrentUserUseCase, LoginUseCase } from "../application/auth-use-cases.js";
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from "../application/project-use-cases.js";
import {
  CreateSocialAccountUseCase,
  DeleteSocialAccountUseCase,
  ListSocialAccountsUseCase,
  UpdateSocialAccountUseCase,
} from "../application/social-account-use-cases.js";
import {
  CreateEpisodeUseCase,
  DeleteEpisodeUseCase,
  DeleteMediaAssetUseCase,
  GetMediaFileUseCase,
  ListEpisodeMediaUseCase,
  ListEpisodesUseCase,
  ListProjectMediaUseCase,
  UploadEpisodeMediaUseCase,
} from "../application/content-use-cases.js";
import {
  DomainError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../domain/errors.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerContentRoutes } from "./routes/content.js";
import type { SocialPublisher, TokenService } from "../application/ports.js";

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
  deleteProject: DeleteProjectUseCase;
  listSocialAccounts: ListSocialAccountsUseCase;
  createSocialAccount: CreateSocialAccountUseCase;
  updateSocialAccount: UpdateSocialAccountUseCase;
  deleteSocialAccount: DeleteSocialAccountUseCase;
  listEpisodes: ListEpisodesUseCase;
  createEpisode: CreateEpisodeUseCase;
  deleteEpisode: DeleteEpisodeUseCase;
  listProjectMedia: ListProjectMediaUseCase;
  listEpisodeMedia: ListEpisodeMediaUseCase;
  uploadEpisodeMedia: UploadEpisodeMediaUseCase;
  deleteMediaAsset: DeleteMediaAssetUseCase;
  getMediaFile: GetMediaFileUseCase;
  manualPublisher: SocialPublisher;
}

export async function createApp(config: AppConfig) {
  const { db, pool } = createDb(config.DATABASE_URL);

  const users = new DrizzleUserRepository(db);
  const projects = new DrizzleProjectRepository(db);
  const vault = new AesGcmCredentialVault(config.CREDENTIALS_ENCRYPTION_KEY);
  const socialAccounts = new DrizzleSocialAccountRepository(db, vault);
  const episodes = new DrizzleEpisodeRepository(db);
  const mediaAssets = new DrizzleMediaAssetRepository(db);
  const mediaStorage = new LocalMediaStorage(config.MEDIA_ROOT);
  const hasher = new Argon2PasswordHasher();
  const tokens = new JoseJwtTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN);
  const manualPublisher = new ManualPublisher();
  const uploadLimits = {
    maxImageBytes: config.MEDIA_MAX_IMAGE_BYTES,
    maxVideoBytes: config.MEDIA_MAX_VIDEO_BYTES,
  };

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
    deleteProject: new DeleteProjectUseCase(projects),
    listSocialAccounts: new ListSocialAccountsUseCase(projects, socialAccounts),
    createSocialAccount: new CreateSocialAccountUseCase(projects, socialAccounts),
    updateSocialAccount: new UpdateSocialAccountUseCase(projects, socialAccounts),
    deleteSocialAccount: new DeleteSocialAccountUseCase(projects, socialAccounts),
    listEpisodes: new ListEpisodesUseCase(projects, episodes),
    createEpisode: new CreateEpisodeUseCase(projects, episodes),
    deleteEpisode: new DeleteEpisodeUseCase(projects, episodes, mediaAssets, mediaStorage),
    listProjectMedia: new ListProjectMediaUseCase(projects, mediaAssets),
    listEpisodeMedia: new ListEpisodeMediaUseCase(projects, episodes, mediaAssets),
    uploadEpisodeMedia: new UploadEpisodeMediaUseCase(
      projects,
      episodes,
      mediaAssets,
      mediaStorage,
      uploadLimits,
    ),
    deleteMediaAsset: new DeleteMediaAssetUseCase(projects, mediaAssets, mediaStorage),
    getMediaFile: new GetMediaFileUseCase(projects, mediaAssets, mediaStorage),
    manualPublisher,
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
          "CREDENTIALS_ENCRYPTION_KEY",
          "accessToken",
          "refreshToken",
          "clientSecret",
          "apiKey",
          "credentials.accessToken",
          "credentials.refreshToken",
          "credentials.clientSecret",
          "credentials.apiKey",
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
  await registerContentRoutes(app, services);

  return { app, services, pool };
}
