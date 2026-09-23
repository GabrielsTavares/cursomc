import type {
  CreateSocialAccountRequest,
  SocialAccount,
  SocialAccountStatus,
  UpdateSocialAccountRequest,
} from "@creator-hub/shared-types";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import {
  hasAnyCredential,
  mergeCredentials,
  SOCIAL_ACCOUNT_STATUSES,
  SOCIAL_PLATFORMS,
  toPublicSocialAccount,
  type SocialCredentialSecrets,
} from "../domain/models.js";
import type { ProjectRepository, SocialAccountRepository } from "./ports.js";

function assertPlatform(value: string) {
  if (!SOCIAL_PLATFORMS.includes(value as (typeof SOCIAL_PLATFORMS)[number])) {
    throw new ValidationError(`Invalid platform: ${value}`);
  }
}

function assertStatus(value: string | undefined) {
  if (value === undefined) return;
  if (!SOCIAL_ACCOUNT_STATUSES.includes(value as (typeof SOCIAL_ACCOUNT_STATUSES)[number])) {
    throw new ValidationError(`Invalid status: ${value}`);
  }
}

function normalizeSecrets(
  input: CreateSocialAccountRequest["credentials"] | undefined,
): SocialCredentialSecrets | null {
  if (!input) return null;
  const secrets: SocialCredentialSecrets = {};
  if (input.accessToken?.trim()) secrets.accessToken = input.accessToken.trim();
  if (input.refreshToken?.trim()) secrets.refreshToken = input.refreshToken.trim();
  if (input.clientId?.trim()) secrets.clientId = input.clientId.trim();
  if (input.clientSecret?.trim()) secrets.clientSecret = input.clientSecret.trim();
  if (input.apiKey?.trim()) secrets.apiKey = input.apiKey.trim();
  if (input.extraJson?.trim()) {
    const raw = input.extraJson.trim();
    try {
      JSON.parse(raw);
    } catch {
      throw new ValidationError("extraJson must be valid JSON");
    }
    secrets.extraJson = raw;
  }
  return hasAnyCredential(secrets) ? secrets : null;
}

function resolveStatus(
  requested: SocialAccountStatus | undefined,
  secrets: SocialCredentialSecrets | null,
): SocialAccountStatus {
  if (requested === "MANUAL") return "MANUAL";
  if (requested === "CONNECTED" || requested === "NEEDS_CREDENTIALS") {
    if (requested === "CONNECTED" && !hasAnyCredential(secrets)) {
      throw new ValidationError("CONNECTED requires at least one credential field");
    }
    return requested;
  }
  return hasAnyCredential(secrets) ? "CONNECTED" : "NEEDS_CREDENTIALS";
}

async function assertOwnsProject(
  projects: ProjectRepository,
  ownerUserId: string,
  projectId: string,
) {
  const project = await projects.findByIdForOwner(projectId, ownerUserId);
  if (!project) {
    throw new NotFoundError("Project not found");
  }
  return project;
}

export class ListSocialAccountsUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly accounts: SocialAccountRepository,
  ) {}

  async execute(ownerUserId: string, projectId: string): Promise<SocialAccount[]> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const rows = await this.accounts.listByProject(projectId);
    const result: SocialAccount[] = [];
    for (const row of rows) {
      const secrets = await this.accounts.getSecrets(row.id);
      result.push(toPublicSocialAccount(row, secrets));
    }
    return result;
  }
}

export class CreateSocialAccountUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly accounts: SocialAccountRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    input: CreateSocialAccountRequest,
  ): Promise<SocialAccount> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);

    const displayName = input.displayName?.trim();
    if (!displayName) {
      throw new ValidationError("displayName is required");
    }
    assertPlatform(input.platform);
    assertStatus(input.status);

    const secrets = normalizeSecrets(input.credentials);
    const status = resolveStatus(input.status, secrets);

    const created = await this.accounts.create({
      projectId,
      platform: input.platform,
      displayName,
      status,
      externalAccountId: input.externalAccountId?.trim() || null,
    });

    if (secrets) {
      await this.accounts.upsertSecrets(created.id, secrets);
    }

    return toPublicSocialAccount(created, secrets);
  }
}

export class UpdateSocialAccountUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly accounts: SocialAccountRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    accountId: string,
    input: UpdateSocialAccountRequest,
  ): Promise<SocialAccount> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);

    const existing = await this.accounts.findByIdForProject(accountId, projectId);
    if (!existing) {
      throw new NotFoundError("Social account not found");
    }

    if (input.displayName !== undefined && !input.displayName.trim()) {
      throw new ValidationError("displayName cannot be empty");
    }
    assertStatus(input.status);

    let secrets = await this.accounts.getSecrets(accountId);
    if (input.credentials) {
      const patch = normalizeSecrets(input.credentials) ?? {};
      if (input.credentials.extraJson !== undefined && input.credentials.extraJson.trim()) {
        try {
          JSON.parse(input.credentials.extraJson.trim());
        } catch {
          throw new ValidationError("extraJson must be valid JSON");
        }
      }
      secrets = mergeCredentials(secrets, {
        accessToken: input.credentials.accessToken,
        refreshToken: input.credentials.refreshToken,
        clientId: input.credentials.clientId,
        clientSecret: input.credentials.clientSecret,
        apiKey: input.credentials.apiKey,
        extraJson: input.credentials.extraJson,
      });
      if (hasAnyCredential(secrets)) {
        await this.accounts.upsertSecrets(accountId, secrets);
      }
    }

    const nextStatus =
      input.status !== undefined
        ? resolveStatus(input.status, secrets)
        : existing.status === "MANUAL"
          ? "MANUAL"
          : hasAnyCredential(secrets)
            ? "CONNECTED"
            : "NEEDS_CREDENTIALS";

    const updated = await this.accounts.update(accountId, projectId, {
      displayName: input.displayName?.trim(),
      status: nextStatus,
      externalAccountId:
        input.externalAccountId === undefined
          ? undefined
          : input.externalAccountId?.trim() || null,
    });
    if (!updated) {
      throw new NotFoundError("Social account not found");
    }

    return toPublicSocialAccount(updated, secrets);
  }
}

export class DeleteSocialAccountUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly accounts: SocialAccountRepository,
  ) {}

  async execute(ownerUserId: string, projectId: string, accountId: string): Promise<void> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const deleted = await this.accounts.delete(accountId, projectId);
    if (!deleted) {
      throw new NotFoundError("Social account not found");
    }
  }
}
