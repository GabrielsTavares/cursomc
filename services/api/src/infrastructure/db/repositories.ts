import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import type {
  ContentKind,
  EpisodeStatus,
  MediaAssetType,
  ProjectType,
  PublicationStatus,
  SocialAccountStatus,
  SocialPlatform,
} from "@creator-hub/shared-types";
import type {
  ContentProjectRecord,
  EpisodeRecord,
  MediaAssetRecord,
  ScheduledPublicationRecord,
  SocialAccountRecord,
  SocialCredentialSecrets,
  UserRecord,
} from "../../domain/models.js";
import type {
  CredentialVault,
  EpisodeRepository,
  MediaAssetRepository,
  ProjectRepository,
  PublicationRepository,
  SocialAccountRepository,
  UserRepository,
} from "../../application/ports.js";
import type { Db } from "./client.js";
import {
  contentProjects,
  episodes,
  mediaAssets,
  scheduledPublications,
  socialAccountSecrets,
  socialAccounts,
  users,
  workspaces,
} from "./schema.js";

function mapUser(row: typeof users.$inferSelect): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}

function mapProject(row: typeof contentProjects.$inferSelect): ContentProjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    projectType: row.projectType as ProjectType,
    enabledModules: row.enabledModules ?? [],
    localeDefault: row.localeDefault,
    createdAt: row.createdAt,
  };
}

function mapSocialAccount(row: typeof socialAccounts.$inferSelect): SocialAccountRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    platform: row.platform as SocialPlatform,
    displayName: row.displayName,
    status: row.status as SocialAccountStatus,
    externalAccountId: row.externalAccountId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEpisode(row: typeof episodes.$inferSelect): EpisodeRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    contentKind: row.contentKind as ContentKind,
    status: row.status as EpisodeStatus,
    locale: row.locale,
    hook: row.hook ?? null,
    description: row.description ?? null,
    targetDurationSeconds: row.targetDurationSeconds ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAssetRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId ?? null,
    type: row.type as MediaAssetType,
    storageKey: row.storageKey,
    mime: row.mime,
    sizeBytes: Number(row.sizeBytes),
    checksum: row.checksum ?? null,
    originalFilename: row.originalFilename ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function mapPublication(
  row: typeof scheduledPublications.$inferSelect,
): ScheduledPublicationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    platform: row.platform as SocialPlatform,
    socialAccountId: row.socialAccountId,
    scheduledAt: row.scheduledAt,
    caption: row.caption ?? null,
    status: row.status as PublicationStatus,
    externalPostId: row.externalPostId ?? null,
    errorMessage: row.errorMessage ?? null,
    checklist: row.checklist ?? null,
    publishAttemptId: row.publishAttemptId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Db["db"]) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    const row = rows[0];
    return row ? mapUser(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    const row = rows[0];
    return row ? mapUser(row) : null;
  }
}

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db["db"]) {}

  async listByOwner(ownerUserId: string): Promise<ContentProjectRecord[]> {
    const rows = await this.db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.ownerUserId, ownerUserId));
    return rows.map(mapProject);
  }

  async findByIdForOwner(id: string, ownerUserId: string): Promise<ContentProjectRecord | null> {
    const rows = await this.db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.id, id))
      .limit(1);
    const row = rows[0];
    if (!row || row.ownerUserId !== ownerUserId) return null;
    return mapProject(row);
  }

  async create(input: {
    ownerUserId: string;
    workspaceId: string | null;
    name: string;
    projectType: ProjectType;
    enabledModules: string[];
    localeDefault: string;
  }): Promise<ContentProjectRecord> {
    const [row] = await this.db
      .insert(contentProjects)
      .values({
        ownerUserId: input.ownerUserId,
        workspaceId: input.workspaceId,
        name: input.name,
        projectType: input.projectType,
        enabledModules: input.enabledModules,
        localeDefault: input.localeDefault,
      })
      .returning();
    if (!row) throw new Error("Failed to create project");
    return mapProject(row);
  }

  async update(
    id: string,
    ownerUserId: string,
    patch: Partial<{
      name: string;
      projectType: ProjectType;
      enabledModules: string[];
      localeDefault: string;
    }>,
  ): Promise<ContentProjectRecord | null> {
    const existing = await this.findByIdForOwner(id, ownerUserId);
    if (!existing) return null;

    const [row] = await this.db
      .update(contentProjects)
      .set({
        name: patch.name ?? existing.name,
        projectType: patch.projectType ?? existing.projectType,
        enabledModules: patch.enabledModules ?? existing.enabledModules,
        localeDefault: patch.localeDefault ?? existing.localeDefault,
      })
      .where(eq(contentProjects.id, id))
      .returning();
    return row ? mapProject(row) : null;
  }

  async delete(id: string, ownerUserId: string): Promise<boolean> {
    const existing = await this.findByIdForOwner(id, ownerUserId);
    if (!existing) return false;
    await this.db.delete(contentProjects).where(eq(contentProjects.id, id));
    return true;
  }

  async findPersonalWorkspaceId(ownerUserId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, ownerUserId))
      .limit(1);
    return rows[0]?.id ?? null;
  }
}

export class DrizzleSocialAccountRepository implements SocialAccountRepository {
  constructor(
    private readonly db: Db["db"],
    private readonly vault: CredentialVault,
  ) {}

  async listByProject(projectId: string): Promise<SocialAccountRecord[]> {
    const rows = await this.db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.projectId, projectId));
    return rows.map(mapSocialAccount);
  }

  async findByIdForProject(id: string, projectId: string): Promise<SocialAccountRecord | null> {
    const rows = await this.db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.id, id), eq(socialAccounts.projectId, projectId)))
      .limit(1);
    const row = rows[0];
    return row ? mapSocialAccount(row) : null;
  }

  async create(input: {
    projectId: string;
    platform: SocialPlatform;
    displayName: string;
    status: SocialAccountStatus;
    externalAccountId: string | null;
  }): Promise<SocialAccountRecord> {
    const now = new Date();
    const [row] = await this.db
      .insert(socialAccounts)
      .values({
        projectId: input.projectId,
        platform: input.platform,
        displayName: input.displayName,
        status: input.status,
        externalAccountId: input.externalAccountId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error("Failed to create social account");
    return mapSocialAccount(row);
  }

  async update(
    id: string,
    projectId: string,
    patch: Partial<{
      displayName: string;
      status: SocialAccountStatus;
      externalAccountId: string | null;
    }>,
  ): Promise<SocialAccountRecord | null> {
    const existing = await this.findByIdForProject(id, projectId);
    if (!existing) return null;

    const [row] = await this.db
      .update(socialAccounts)
      .set({
        displayName: patch.displayName ?? existing.displayName,
        status: patch.status ?? existing.status,
        externalAccountId:
          patch.externalAccountId !== undefined
            ? patch.externalAccountId
            : existing.externalAccountId,
        updatedAt: new Date(),
      })
      .where(and(eq(socialAccounts.id, id), eq(socialAccounts.projectId, projectId)))
      .returning();
    return row ? mapSocialAccount(row) : null;
  }

  async delete(id: string, projectId: string): Promise<boolean> {
    const existing = await this.findByIdForProject(id, projectId);
    if (!existing) return false;
    await this.db
      .delete(socialAccounts)
      .where(and(eq(socialAccounts.id, id), eq(socialAccounts.projectId, projectId)));
    return true;
  }

  async getSecrets(socialAccountId: string): Promise<SocialCredentialSecrets | null> {
    const rows = await this.db
      .select()
      .from(socialAccountSecrets)
      .where(eq(socialAccountSecrets.socialAccountId, socialAccountId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.vault.decrypt(row.encryptedPayload);
  }

  async upsertSecrets(
    socialAccountId: string,
    secrets: SocialCredentialSecrets,
  ): Promise<void> {
    const encryptedPayload = this.vault.encrypt(secrets);
    const now = new Date();
    await this.db
      .insert(socialAccountSecrets)
      .values({
        socialAccountId,
        encryptedPayload,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: socialAccountSecrets.socialAccountId,
        set: {
          encryptedPayload,
          updatedAt: now,
        },
      });
  }

  async deleteSecrets(socialAccountId: string): Promise<void> {
    await this.db
      .delete(socialAccountSecrets)
      .where(eq(socialAccountSecrets.socialAccountId, socialAccountId));
  }
}

export class DrizzleEpisodeRepository implements EpisodeRepository {
  constructor(private readonly db: Db["db"]) {}

  async listByProject(projectId: string): Promise<EpisodeRecord[]> {
    const rows = await this.db
      .select()
      .from(episodes)
      .where(eq(episodes.projectId, projectId))
      .orderBy(desc(episodes.updatedAt));
    return rows.map(mapEpisode);
  }

  async findByIdForProject(id: string, projectId: string): Promise<EpisodeRecord | null> {
    const rows = await this.db
      .select()
      .from(episodes)
      .where(and(eq(episodes.id, id), eq(episodes.projectId, projectId)))
      .limit(1);
    const row = rows[0];
    return row ? mapEpisode(row) : null;
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
  }): Promise<EpisodeRecord> {
    const now = new Date();
    const [row] = await this.db
      .insert(episodes)
      .values({
        projectId: input.projectId,
        title: input.title,
        contentKind: input.contentKind,
        status: input.status,
        locale: input.locale,
        hook: input.hook,
        description: input.description,
        targetDurationSeconds: input.targetDurationSeconds,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error("Failed to create episode");
    return mapEpisode(row);
  }

  async delete(id: string, projectId: string): Promise<boolean> {
    const existing = await this.findByIdForProject(id, projectId);
    if (!existing) return false;
    await this.db
      .delete(episodes)
      .where(and(eq(episodes.id, id), eq(episodes.projectId, projectId)));
    return true;
  }

  async countMediaByEpisodeIds(episodeIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (episodeIds.length === 0) return result;
    const rows = await this.db
      .select({
        episodeId: mediaAssets.episodeId,
        total: count(),
      })
      .from(mediaAssets)
      .where(inArray(mediaAssets.episodeId, episodeIds))
      .groupBy(mediaAssets.episodeId);
    for (const row of rows) {
      if (row.episodeId) result.set(row.episodeId, Number(row.total));
    }
    return result;
  }
}

export class DrizzleMediaAssetRepository implements MediaAssetRepository {
  constructor(private readonly db: Db["db"]) {}

  async listByProject(projectId: string): Promise<MediaAssetRecord[]> {
    const rows = await this.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.projectId, projectId))
      .orderBy(desc(mediaAssets.createdAt));
    return rows.map(mapMediaAsset);
  }

  async listByEpisode(episodeId: string): Promise<MediaAssetRecord[]> {
    const rows = await this.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.episodeId, episodeId))
      .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt));
    return rows.map(mapMediaAsset);
  }

  async findByIdForProject(id: string, projectId: string): Promise<MediaAssetRecord | null> {
    const rows = await this.db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.projectId, projectId)))
      .limit(1);
    const row = rows[0];
    return row ? mapMediaAsset(row) : null;
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
  }): Promise<MediaAssetRecord> {
    const [row] = await this.db
      .insert(mediaAssets)
      .values({
        projectId: input.projectId,
        episodeId: input.episodeId,
        type: input.type,
        storageKey: input.storageKey,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        originalFilename: input.originalFilename,
        sortOrder: input.sortOrder,
      })
      .returning();
    if (!row) throw new Error("Failed to create media asset");
    return mapMediaAsset(row);
  }

  async delete(id: string, projectId: string): Promise<MediaAssetRecord | null> {
    const existing = await this.findByIdForProject(id, projectId);
    if (!existing) return null;
    await this.db
      .delete(mediaAssets)
      .where(and(eq(mediaAssets.id, id), eq(mediaAssets.projectId, projectId)));
    return existing;
  }

  async nextSortOrder(episodeId: string): Promise<number> {
    const rows = await this.db
      .select({ maxOrder: max(mediaAssets.sortOrder) })
      .from(mediaAssets)
      .where(eq(mediaAssets.episodeId, episodeId));
    const current = rows[0]?.maxOrder;
    return current === null || current === undefined ? 0 : Number(current) + 1;
  }
}

export class DrizzlePublicationRepository implements PublicationRepository {
  constructor(
    private readonly db: Db["db"],
    private readonly pool: Db["pool"],
  ) {}

  async listByProject(projectId: string): Promise<ScheduledPublicationRecord[]> {
    const rows = await this.db
      .select()
      .from(scheduledPublications)
      .where(eq(scheduledPublications.projectId, projectId))
      .orderBy(asc(scheduledPublications.scheduledAt));
    return rows.map(mapPublication);
  }

  async findByIdForProject(
    id: string,
    projectId: string,
  ): Promise<ScheduledPublicationRecord | null> {
    const rows = await this.db
      .select()
      .from(scheduledPublications)
      .where(
        and(
          eq(scheduledPublications.id, id),
          eq(scheduledPublications.projectId, projectId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? mapPublication(row) : null;
  }

  async createMany(
    rows: Array<{
      projectId: string;
      episodeId: string;
      platform: SocialPlatform;
      socialAccountId: string;
      scheduledAt: Date;
      caption: string | null;
      status: PublicationStatus;
    }>,
  ): Promise<ScheduledPublicationRecord[]> {
    if (rows.length === 0) return [];
    const now = new Date();
    const inserted = await this.db
      .insert(scheduledPublications)
      .values(
        rows.map((r) => ({
          projectId: r.projectId,
          episodeId: r.episodeId,
          platform: r.platform,
          socialAccountId: r.socialAccountId,
          scheduledAt: r.scheduledAt,
          caption: r.caption,
          status: r.status,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning();
    return inserted.map(mapPublication);
  }

  async update(
    id: string,
    patch: Partial<{
      status: PublicationStatus;
      scheduledAt: Date;
      caption: string | null;
      externalPostId: string | null;
      errorMessage: string | null;
      checklist: string[] | null;
      publishAttemptId: string | null;
    }>,
  ): Promise<ScheduledPublicationRecord | null> {
    const [row] = await this.db
      .update(scheduledPublications)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(scheduledPublications.id, id))
      .returning();
    return row ? mapPublication(row) : null;
  }

  /**
   * Atomic claim via FOR UPDATE SKIP LOCKED (safe for multi-instance later).
   */
  async claimDue(
    limit: number,
    attemptId: string,
    now: Date = new Date(),
  ): Promise<ScheduledPublicationRecord[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const select = await client.query<{ id: string }>(
        `SELECT id
         FROM scheduled_publications
         WHERE status = 'SCHEDULED' AND scheduled_at <= $1
         ORDER BY scheduled_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [now.toISOString(), limit],
      );
      if (select.rows.length === 0) {
        await client.query("COMMIT");
        return [];
      }
      const ids = select.rows.map((r) => r.id);
      const updated = await client.query(
        `UPDATE scheduled_publications
         SET status = 'PUBLISHING',
             publish_attempt_id = $1,
             error_message = NULL,
             updated_at = NOW()
         WHERE id = ANY($2::uuid[])
         RETURNING *`,
        [attemptId, ids],
      );
      await client.query("COMMIT");
      return updated.rows.map((row) =>
        mapPublication({
          id: row.id as string,
          projectId: row.project_id as string,
          episodeId: row.episode_id as string,
          platform: row.platform as string,
          socialAccountId: row.social_account_id as string,
          scheduledAt: new Date(row.scheduled_at as string),
          caption: (row.caption as string | null) ?? null,
          status: row.status as string,
          externalPostId: (row.external_post_id as string | null) ?? null,
          errorMessage: (row.error_message as string | null) ?? null,
          checklist: (row.checklist as string[] | null) ?? null,
          publishAttemptId: (row.publish_attempt_id as string | null) ?? null,
          createdAt: new Date(row.created_at as string),
          updatedAt: new Date(row.updated_at as string),
        }),
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
