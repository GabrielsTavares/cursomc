import type {
  ContentKind,
  CreateEpisodeRequest,
  Episode,
  MediaAsset,
  MediaAssetType,
} from "@creator-hub/shared-types";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  CONTENT_KINDS,
  toPublicEpisode,
  toPublicMediaAsset,
} from "../domain/models.js";
import type {
  EpisodeRepository,
  MediaAssetRepository,
  MediaStorage,
  ProjectRepository,
} from "./ports.js";

export interface MediaUploadLimits {
  maxImageBytes: number;
  maxVideoBytes: number;
}

async function assertOwnsProject(
  projects: ProjectRepository,
  ownerUserId: string,
  projectId: string,
) {
  const project = await projects.findByIdForOwner(projectId, ownerUserId);
  if (!project) {
    throw new NotFoundError("Projeto não encontrado");
  }
  return project;
}

function assertContentKind(value: string): asserts value is ContentKind {
  if (!CONTENT_KINDS.includes(value as ContentKind)) {
    throw new ValidationError(`Tipo de conteúdo inválido: ${value}`);
  }
}

function resolveMimeAndType(
  mimeRaw: string,
  contentKind: ContentKind,
): { mime: string; type: MediaAssetType } {
  const mime = mimeRaw.toLowerCase().split(";")[0]?.trim() ?? "";
  if (ALLOWED_IMAGE_MIMES.has(mime)) {
    if (contentKind === "VIDEO") {
      throw new ValidationError(
        "Este conteúdo é vídeo único — envia um ficheiro mp4 ou webm.",
      );
    }
    return { mime, type: "IMAGE" };
  }
  if (ALLOWED_VIDEO_MIMES.has(mime)) {
    if (contentKind === "IMAGE" || contentKind === "CAROUSEL") {
      throw new ValidationError(
        contentKind === "CAROUSEL"
          ? "Carrossel só aceita imagens (jpg, png ou webp)."
          : "Este conteúdo é foto — envia jpg, png ou webp.",
      );
    }
    return { mime, type: "VIDEO" };
  }
  throw new ValidationError(
    "Formato não suportado. Usa jpg/png/webp para imagens ou mp4/webm para vídeo.",
  );
}

function assertSize(type: MediaAssetType, sizeBytes: number, limits: MediaUploadLimits) {
  if (type === "IMAGE" && sizeBytes > limits.maxImageBytes) {
    throw new ValidationError(
      `Imagem demasiado grande (máx. ${Math.round(limits.maxImageBytes / (1024 * 1024))} MB).`,
    );
  }
  if (type === "VIDEO" && sizeBytes > limits.maxVideoBytes) {
    throw new ValidationError(
      `Vídeo demasiado grande (máx. ${Math.round(limits.maxVideoBytes / (1024 * 1024))} MB).`,
    );
  }
}

export class ListEpisodesUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly episodes: EpisodeRepository,
  ) {}

  async execute(ownerUserId: string, projectId: string): Promise<Episode[]> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const rows = await this.episodes.listByProject(projectId);
    const counts = await this.episodes.countMediaByEpisodeIds(rows.map((r) => r.id));
    return rows.map((row) => toPublicEpisode(row, counts.get(row.id) ?? 0));
  }
}

export class CreateEpisodeUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly episodes: EpisodeRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    input: CreateEpisodeRequest,
  ): Promise<Episode> {
    const project = await assertOwnsProject(this.projects, ownerUserId, projectId);
    const title = input.title?.trim();
    if (!title) {
      throw new ValidationError("O título é obrigatório");
    }
    assertContentKind(input.contentKind);

    const created = await this.episodes.create({
      projectId,
      title,
      contentKind: input.contentKind,
      status: "DRAFT",
      locale: input.locale?.trim() || project.localeDefault || "pt-BR",
      hook: input.hook?.trim() || null,
      description: input.description?.trim() || null,
      targetDurationSeconds:
        input.targetDurationSeconds === undefined ? null : input.targetDurationSeconds,
    });
    return toPublicEpisode(created, 0);
  }
}

export class DeleteEpisodeUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly episodes: EpisodeRepository,
    private readonly media: MediaAssetRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute(ownerUserId: string, projectId: string, episodeId: string): Promise<void> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const existing = await this.episodes.findByIdForProject(episodeId, projectId);
    if (!existing) {
      throw new NotFoundError("Conteúdo não encontrado");
    }
    const assets = await this.media.listByEpisode(episodeId);
    for (const asset of assets) {
      await this.storage.delete(asset.storageKey);
      await this.media.delete(asset.id, projectId);
    }
    const deleted = await this.episodes.delete(episodeId, projectId);
    if (!deleted) {
      throw new NotFoundError("Conteúdo não encontrado");
    }
  }
}

export class ListProjectMediaUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly media: MediaAssetRepository,
  ) {}

  async execute(ownerUserId: string, projectId: string): Promise<MediaAsset[]> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const rows = await this.media.listByProject(projectId);
    return rows.map(toPublicMediaAsset);
  }
}

export class ListEpisodeMediaUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly episodes: EpisodeRepository,
    private readonly media: MediaAssetRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    episodeId: string,
  ): Promise<MediaAsset[]> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const episode = await this.episodes.findByIdForProject(episodeId, projectId);
    if (!episode) {
      throw new NotFoundError("Conteúdo não encontrado");
    }
    const rows = await this.media.listByEpisode(episodeId);
    return rows.map(toPublicMediaAsset);
  }
}

export class UploadEpisodeMediaUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly episodes: EpisodeRepository,
    private readonly media: MediaAssetRepository,
    private readonly storage: MediaStorage,
    private readonly limits: MediaUploadLimits,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    episodeId: string,
    file: {
      filename: string | null;
      mimeType: string;
      body: Buffer;
    },
  ): Promise<MediaAsset> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const episode = await this.episodes.findByIdForProject(episodeId, projectId);
    if (!episode) {
      throw new NotFoundError("Conteúdo não encontrado");
    }
    if (!file.body?.byteLength) {
      throw new ValidationError("Ficheiro vazio — escolhe outra imagem ou vídeo.");
    }

    const { mime, type } = resolveMimeAndType(file.mimeType, episode.contentKind);
    assertSize(type, file.body.byteLength, this.limits);

    if (episode.contentKind === "VIDEO" || episode.contentKind === "IMAGE") {
      const existing = await this.media.listByEpisode(episodeId);
      if (existing.length >= 1) {
        throw new ValidationError(
          episode.contentKind === "VIDEO"
            ? "Este vídeo já tem um ficheiro. Apaga o atual para enviar outro."
            : "Esta foto já tem um ficheiro. Apaga o atual para enviar outro.",
        );
      }
    }

    const stored = await this.storage.store({
      projectId,
      originalFilename: file.filename,
      mime,
      body: file.body,
    });

    const sortOrder =
      episode.contentKind === "CAROUSEL"
        ? await this.media.nextSortOrder(episodeId)
        : 0;

    try {
      const created = await this.media.create({
        projectId,
        episodeId,
        type,
        storageKey: stored.storageKey,
        mime,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
        originalFilename: file.filename,
        sortOrder,
      });
      return toPublicMediaAsset(created);
    } catch (err) {
      await this.storage.delete(stored.storageKey);
      throw err;
    }
  }
}

export class DeleteMediaAssetUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly media: MediaAssetRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute(ownerUserId: string, projectId: string, mediaId: string): Promise<void> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const deleted = await this.media.delete(mediaId, projectId);
    if (!deleted) {
      throw new NotFoundError("Mídia não encontrada");
    }
    await this.storage.delete(deleted.storageKey);
  }
}

export class GetMediaFileUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly media: MediaAssetRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    mediaId: string,
  ): Promise<{ absolutePath: string; mime: string; filename: string | null }> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const asset = await this.media.findByIdForProject(mediaId, projectId);
    if (!asset) {
      throw new NotFoundError("Mídia não encontrada");
    }
    const absolutePath = this.storage.resolvePath(asset.storageKey);
    return {
      absolutePath,
      mime: asset.mime,
      filename: asset.originalFilename,
    };
  }
}
