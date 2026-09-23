import { eq } from "drizzle-orm";
import type { ProjectType } from "@creator-hub/shared-types";
import type { ContentProjectRecord, UserRecord } from "../../domain/models.js";
import type { ProjectRepository, UserRepository } from "../../application/ports.js";
import type { Db } from "./client.js";
import { contentProjects, users, workspaces } from "./schema.js";

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

  async findPersonalWorkspaceId(ownerUserId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, ownerUserId))
      .limit(1);
    return rows[0]?.id ?? null;
  }
}
