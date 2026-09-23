import { describe, expect, it } from "vitest";
import type {
  ProjectType,
  SocialAccountStatus,
  SocialPlatform,
} from "@creator-hub/shared-types";
import {
  CreateProjectUseCase,
  DeleteProjectUseCase,
  ListProjectsUseCase,
} from "./project-use-cases.js";
import {
  CreateSocialAccountUseCase,
  DeleteSocialAccountUseCase,
  ListSocialAccountsUseCase,
  UpdateSocialAccountUseCase,
} from "./social-account-use-cases.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type {
  ContentProjectRecord,
  SocialAccountRecord,
  SocialCredentialSecrets,
} from "../domain/models.js";
import { maskSecret } from "../domain/models.js";
import type { ProjectRepository, SocialAccountRepository } from "./ports.js";
import { AesGcmCredentialVault } from "../infrastructure/security/credential-vault.js";
import { ManualPublisher } from "../infrastructure/publishers/manual-publisher.js";

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

  async update(
    id: string,
    ownerUserId: string,
    patch: Partial<{
      name: string;
      projectType: ProjectType;
      enabledModules: string[];
      localeDefault: string;
    }>,
  ) {
    const existing = await this.findByIdForOwner(id, ownerUserId);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.projects.set(id, next);
    return next;
  }

  async delete(id: string, ownerUserId: string) {
    const existing = await this.findByIdForOwner(id, ownerUserId);
    if (!existing) return false;
    this.projects.delete(id);
    return true;
  }

  async findPersonalWorkspaceId() {
    return "ws-1";
  }
}

class MemorySocialAccounts implements SocialAccountRepository {
  private accounts = new Map<string, SocialAccountRecord>();
  private secrets = new Map<string, SocialCredentialSecrets>();
  private seq = 1;

  async listByProject(projectId: string) {
    return [...this.accounts.values()].filter((a) => a.projectId === projectId);
  }

  async findByIdForProject(id: string, projectId: string) {
    const a = this.accounts.get(id);
    if (!a || a.projectId !== projectId) return null;
    return a;
  }

  async create(input: {
    projectId: string;
    platform: SocialPlatform;
    displayName: string;
    status: SocialAccountStatus;
    externalAccountId: string | null;
  }) {
    const id = `sa-${this.seq++}`;
    const now = new Date("2026-09-23T12:00:00.000Z");
    const row: SocialAccountRecord = {
      id,
      projectId: input.projectId,
      platform: input.platform,
      displayName: input.displayName,
      status: input.status,
      externalAccountId: input.externalAccountId,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(id, row);
    return row;
  }

  async update(
    id: string,
    projectId: string,
    patch: Partial<{
      displayName: string;
      status: SocialAccountStatus;
      externalAccountId: string | null;
    }>,
  ) {
    const existing = await this.findByIdForProject(id, projectId);
    if (!existing) return null;
    const next: SocialAccountRecord = {
      ...existing,
      displayName: patch.displayName ?? existing.displayName,
      status: patch.status ?? existing.status,
      externalAccountId:
        patch.externalAccountId !== undefined
          ? patch.externalAccountId
          : existing.externalAccountId,
      updatedAt: new Date("2026-09-23T13:00:00.000Z"),
    };
    this.accounts.set(id, next);
    return next;
  }

  async delete(id: string, projectId: string) {
    const existing = await this.findByIdForProject(id, projectId);
    if (!existing) return false;
    this.accounts.delete(id);
    this.secrets.delete(id);
    return true;
  }

  async getSecrets(socialAccountId: string) {
    return this.secrets.get(socialAccountId) ?? null;
  }

  async upsertSecrets(socialAccountId: string, secrets: SocialCredentialSecrets) {
    this.secrets.set(socialAccountId, secrets);
  }

  async deleteSecrets(socialAccountId: string) {
    this.secrets.delete(socialAccountId);
  }
}

describe("Project use cases", () => {
  it("creates and lists projects for owner", async () => {
    const repo = new MemoryProjects();
    const create = new CreateProjectUseCase(repo);
    const list = new ListProjectsUseCase(repo);

    const project = await create.execute(OWNER, {
      name: "Studio A",
      projectType: "CREATOR",
    });
    expect(project.name).toBe("Studio A");

    const listed = await list.execute(OWNER);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(project.id);
    expect(await list.execute(OTHER)).toHaveLength(0);
  });

  it("rejects empty name", async () => {
    const create = new CreateProjectUseCase(new MemoryProjects());
    await expect(create.execute(OWNER, { name: "  " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("deletes owned project", async () => {
    const repo = new MemoryProjects();
    const created = await new CreateProjectUseCase(repo).execute(OWNER, { name: "Temp" });
    await new DeleteProjectUseCase(repo).execute(OWNER, created.id);
    expect(await new ListProjectsUseCase(repo).execute(OWNER)).toHaveLength(0);
  });
});

describe("Social account use cases", () => {
  async function seedProject(projects: MemoryProjects) {
    return new CreateProjectUseCase(projects).execute(OWNER, { name: "Hub" });
  }

  it("links account with credentials and masks secrets", async () => {
    const projects = new MemoryProjects();
    const accounts = new MemorySocialAccounts();
    const project = await seedProject(projects);

    const created = await new CreateSocialAccountUseCase(projects, accounts).execute(
      OWNER,
      project.id,
      {
        platform: "TIKTOK",
        displayName: "tiktok_main",
        credentials: {
          accessToken: "tok_live_ABCDEF123456",
          clientSecret: "sec_ZZZZ",
        },
      },
    );

    expect(created.status).toBe("CONNECTED");
    expect(created.credentials.accessToken).toBe("****3456");
    expect(created.credentials.clientSecret).toBe("****ZZZZ");
    expect(created.credentials.accessToken).not.toContain("tok_live");

    const listed = await new ListSocialAccountsUseCase(projects, accounts).execute(
      OWNER,
      project.id,
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.credentials.accessToken).toBe("****3456");
  });

  it("defaults to NEEDS_CREDENTIALS without secrets", async () => {
    const projects = new MemoryProjects();
    const accounts = new MemorySocialAccounts();
    const project = await seedProject(projects);

    const created = await new CreateSocialAccountUseCase(projects, accounts).execute(
      OWNER,
      project.id,
      { platform: "KWAI", displayName: "kwai_manual" },
    );
    expect(created.status).toBe("NEEDS_CREDENTIALS");
  });

  it("allows MANUAL status without credentials", async () => {
    const projects = new MemoryProjects();
    const accounts = new MemorySocialAccounts();
    const project = await seedProject(projects);

    const created = await new CreateSocialAccountUseCase(projects, accounts).execute(
      OWNER,
      project.id,
      { platform: "INSTAGRAM", displayName: "ig", status: "MANUAL" },
    );
    expect(created.status).toBe("MANUAL");
  });

  it("updates display name and merges credentials", async () => {
    const projects = new MemoryProjects();
    const accounts = new MemorySocialAccounts();
    const project = await seedProject(projects);
    const create = new CreateSocialAccountUseCase(projects, accounts);
    const update = new UpdateSocialAccountUseCase(projects, accounts);

    const created = await create.execute(OWNER, project.id, {
      platform: "YOUTUBE",
      displayName: "yt",
      credentials: { apiKey: "oldkey9999" },
    });

    const updated = await update.execute(OWNER, project.id, created.id, {
      displayName: "yt_channel",
      credentials: { accessToken: "newtokenABCD" },
    });

    expect(updated.displayName).toBe("yt_channel");
    expect(updated.credentials.apiKey).toBe("****9999");
    expect(updated.credentials.accessToken).toBe("****ABCD");
    expect(updated.status).toBe("CONNECTED");
  });

  it("deletes social account", async () => {
    const projects = new MemoryProjects();
    const accounts = new MemorySocialAccounts();
    const project = await seedProject(projects);
    const created = await new CreateSocialAccountUseCase(projects, accounts).execute(
      OWNER,
      project.id,
      { platform: "FACEBOOK", displayName: "fb" },
    );
    await new DeleteSocialAccountUseCase(projects, accounts).execute(
      OWNER,
      project.id,
      created.id,
    );
    expect(
      await new ListSocialAccountsUseCase(projects, accounts).execute(OWNER, project.id),
    ).toHaveLength(0);
  });

  it("rejects social ops on foreign project", async () => {
    const projects = new MemoryProjects();
    const accounts = new MemorySocialAccounts();
    const project = await seedProject(projects);
    await expect(
      new CreateSocialAccountUseCase(projects, accounts).execute(OTHER, project.id, {
        platform: "OTHER",
        displayName: "x",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Credential vault + ManualPublisher", () => {
  it("round-trips encrypted secrets", () => {
    const vault = new AesGcmCredentialVault("local-dev-only-change-me-credentials-key!!");
    const secrets = { accessToken: "abc12345", apiKey: "key-9999" };
    const cipher = vault.encrypt(secrets);
    expect(cipher).not.toContain("abc12345");
    expect(vault.decrypt(cipher)).toEqual(secrets);
  });

  it("masks short and long secrets", () => {
    expect(maskSecret("ab")).toBe("****");
    expect(maskSecret("tokenVALUE")).toBe("****ALUE");
    expect(maskSecret("")).toBeNull();
  });

  it("ManualPublisher returns checklist", async () => {
    const publisher = new ManualPublisher();
    const result = await publisher.publish({
      platform: "KWAI",
      displayName: "kwai_main",
      caption: "Olá",
    });
    expect(result.status).toBe("MANUAL_REQUIRED");
    expect(result.checklist.length).toBeGreaterThan(2);
  });
});
