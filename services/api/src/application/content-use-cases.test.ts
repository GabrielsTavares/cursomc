import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ContentKind,
  EpisodeStatus,
  MediaAssetType,
  ProjectType,
} from "@creator-hub/shared-types";
import { CreateProjectUseCase } from "./project-use-cases.js";
import {
  CreateEpisodeUseCase,
  DeleteMediaAssetUseCase,
  ListEpisodesUseCase,
  ListProjectMediaUseCase,
  UploadEpisodeMediaUseCase,
} from "./content-use-cases.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type {
  ContentProjectRecord,
  EpisodeRecord,
  MediaAssetRecord,
} from "../domain/models.js";
import type {
  EpisodeRepository,
  MediaAssetRepository,
  ProjectRepository,
} from "./ports.js";
import { LocalMediaStorage } from "../infrastructure/media/local-media-storage.js";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

class MemoryProjects implements ProjectRepository {
  private projects = new Map<string, ContentProjectRecord>();
  private seq = 1;

  async listByOwner(ownerUserId: string) {
    return [...this.projects.values()].filter((p) => p.ownerUserId === ownerUserId);
  }

  async findByIdForOwner(id: string, ownerUserId: string) {
    const p = this.projects.get(id);
    if (!p || p.ownerUserId !== ownerUserId) return null;
    return p;
  }

  async create(input: {
    ownerUserId: string;
    workspaceId: string | null;
    name: string;
    projectType: ProjectType;
    enabledModules: string[];
    localeDefault: string;
  }) {
    const id = `proj-${this.seq++}`;
    const row: ContentProjectRecord = {
      id,
      workspaceId: input.workspaceId,
      ownerUserId: input.ownerUserId,
      name: input.name,
      projectType: input.projectType,
      enabledModules: input.enabledModules,
      localeDefault: input.localeDefault,
      createdAt: new Date("2026-09-23T00:00:00.000Z"),
    };
    this.projects.set(id, row);
    return row;
  }

  async update() {
    return null;
  }

  async delete() {
    return false;
  }

  async findPersonalWorkspaceId() {
    return null;
  }
}

class MemoryEpisodes implements EpisodeRepository {
  private rows = new Map<string, EpisodeRecord>();
  private seq = 1;

  async listByProject(projectId: string) {
    return [...this.rows.values()]
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findByIdForProject(id: string, projectId: string) {
    const row = this.rows.get(id);
    if (!row || row.projectId !== projectId) return null;
    return row;
  }

  async create(input: {
    projectId: string;
    title: string;
    contentKind: ContentKind;
    status: EpisodeStatus;
    locale: string;
    hook: string | null;
    description: string | null;
    targetDurationSeconds: number | null;
  }) {
    const id = `ep-${this.seq++}`;
    const now = new Date("2026-09-25T00:00:00.000Z");
    const row: EpisodeRecord = { id, ...input, createdAt: now, updatedAt: now };
    this.rows.set(id, row);
    return row;
  }

  async delete(id: string, projectId: string) {
    const row = this.rows.get(id);
    if (!row || row.projectId !== projectId) return false;
    this.rows.delete(id);
    return true;
  }

  async countMediaByEpisodeIds(episodeIds: string[]) {
    // filled via media repo in real impl — tests set counts manually via media list sizes
    void episodeIds;
    return new Map<string, number>();
  }
}

class MemoryMedia implements MediaAssetRepository {
  private rows = new Map<string, MediaAssetRecord>();
  private seq = 1;

  async listByProject(projectId: string) {
    return [...this.rows.values()]
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listByEpisode(episodeId: string) {
    return [...this.rows.values()]
      .filter((m) => m.episodeId === episodeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findByIdForProject(id: string, projectId: string) {
    const row = this.rows.get(id);
    if (!row || row.projectId !== projectId) return null;
    return row;
  }

  async create(input: {
    projectId: string;
    episodeId: string | null;
    type: MediaAssetType;
    storageKey: string;
    mime: string;
    sizeBytes: number;
    checksum: string | null;
    originalFilename: string | null;
    sortOrder: number;
  }) {
    const id = `media-${this.seq++}`;
    const row: MediaAssetRecord = {
      id,
      ...input,
      createdAt: new Date("2026-09-25T00:00:00.000Z"),
    };
    this.rows.set(id, row);
    return row;
  }

  async delete(id: string, projectId: string) {
    const row = this.rows.get(id);
    if (!row || row.projectId !== projectId) return null;
    this.rows.delete(id);
    return row;
  }

  async nextSortOrder(episodeId: string) {
    const list = await this.listByEpisode(episodeId);
    if (list.length === 0) return 0;
    return Math.max(...list.map((m) => m.sortOrder)) + 1;
  }
}

describe("content episodes + media upload", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function setup() {
    const projects = new MemoryProjects();
    const episodes = new MemoryEpisodes();
    const media = new MemoryMedia();
    const root = await mkdtemp(path.join(tmpdir(), "creator-hub-media-"));
    tempDirs.push(root);
    const storage = new LocalMediaStorage(root);
    const createProject = new CreateProjectUseCase(projects);
    const project = await createProject.execute(OWNER, {
      name: "Studio",
      projectType: "CREATOR",
    });
    const limits = { maxImageBytes: 1024 * 1024, maxVideoBytes: 2 * 1024 * 1024 };
    return {
      projects,
      episodes,
      media,
      storage,
      project,
      listEpisodes: new ListEpisodesUseCase(projects, episodes),
      createEpisode: new CreateEpisodeUseCase(projects, episodes),
      upload: new UploadEpisodeMediaUseCase(projects, episodes, media, storage, limits),
      listMedia: new ListProjectMediaUseCase(projects, media),
      deleteMedia: new DeleteMediaAssetUseCase(projects, media, storage),
    };
  }

  it("creates episode and lists for owner", async () => {
    const ctx = await setup();
    const episode = await ctx.createEpisode.execute(OWNER, ctx.project.id, {
      title: "Rival nasceu da água",
      contentKind: "VIDEO",
    });
    expect(episode.status).toBe("DRAFT");
    expect(episode.contentKind).toBe("VIDEO");

    const list = await ctx.listEpisodes.execute(OWNER, ctx.project.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Rival nasceu da água");
  });

  it("rejects other owner's project", async () => {
    const ctx = await setup();
    await expect(
      ctx.createEpisode.execute(OTHER, ctx.project.id, {
        title: "Nope",
        contentKind: "IMAGE",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uploads image to carousel and lists in library", async () => {
    const ctx = await setup();
    const episode = await ctx.createEpisode.execute(OWNER, ctx.project.id, {
      title: "Sequência 1",
      contentKind: "CAROUSEL",
    });

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const asset = await ctx.upload.execute(OWNER, ctx.project.id, episode.id, {
      filename: "frame.png",
      mimeType: "image/png",
      body: png,
    });

    expect(asset.type).toBe("IMAGE");
    expect(asset.mime).toBe("image/png");
    expect(asset.sortOrder).toBe(0);
    expect(asset.downloadUrl).toContain(`/media/${asset.id}/file`);

    const onDisk = await readFile(ctx.storage.resolvePath(
      (await ctx.media.findByIdForProject(asset.id, ctx.project.id))!.storageKey,
    ));
    expect(onDisk.equals(png)).toBe(true);

    const library = await ctx.listMedia.execute(OWNER, ctx.project.id);
    expect(library).toHaveLength(1);

    const second = await ctx.upload.execute(OWNER, ctx.project.id, episode.id, {
      filename: "frame2.png",
      mimeType: "image/png",
      body: png,
    });
    expect(second.sortOrder).toBe(1);
  });

  it("rejects video mime on image episode and path traversal keys", async () => {
    const ctx = await setup();
    const episode = await ctx.createEpisode.execute(OWNER, ctx.project.id, {
      title: "Foto",
      contentKind: "IMAGE",
    });

    await expect(
      ctx.upload.execute(OWNER, ctx.project.id, episode.id, {
        filename: "clip.mp4",
        mimeType: "video/mp4",
        body: Buffer.from("fake"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(() => ctx.storage.resolvePath("../etc/passwd")).toThrow(ValidationError);
    expect(() => ctx.storage.resolvePath("a/../../b")).toThrow(ValidationError);
  });

  it("deletes media from library and disk", async () => {
    const ctx = await setup();
    const episode = await ctx.createEpisode.execute(OWNER, ctx.project.id, {
      title: "Foto",
      contentKind: "IMAGE",
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const asset = await ctx.upload.execute(OWNER, ctx.project.id, episode.id, {
      filename: "x.png",
      mimeType: "image/png",
      body: png,
    });
    const key = (await ctx.media.findByIdForProject(asset.id, ctx.project.id))!.storageKey;

    await ctx.deleteMedia.execute(OWNER, ctx.project.id, asset.id);
    expect(await ctx.listMedia.execute(OWNER, ctx.project.id)).toHaveLength(0);
    await expect(readFile(ctx.storage.resolvePath(key))).rejects.toThrow();
  });
});
