import { and, eq } from "drizzle-orm";
import type {
  ProjectType,
  SocialAccountStatus,
  SocialPlatform,
} from "@creator-hub/shared-types";
import type {
  ContentProjectRecord,
  SocialAccountRecord,
  SocialCredentialSecrets,
  UserRecord,
} from "../../domain/models.js";
import type {
  CredentialVault,
  ProjectRepository,
  SocialAccountRepository,
  UserRepository,
} from "../../application/ports.js";
import type { Db } from "./client.js";
import {
  contentProjects,
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
