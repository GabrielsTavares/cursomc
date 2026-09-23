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
} from "../domain/models.js";

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface ProjectRepository {
  listByOwner(ownerUserId: string): Promise<ContentProjectRecord[]>;
  findByIdForOwner(id: string, ownerUserId: string): Promise<ContentProjectRecord | null>;
  create(input: {
    ownerUserId: string;
    workspaceId: string | null;
    name: string;
    projectType: ProjectType;
    enabledModules: string[];
    localeDefault: string;
  }): Promise<ContentProjectRecord>;
  update(
    id: string,
    ownerUserId: string,
    patch: Partial<{
      name: string;
      projectType: ProjectType;
      enabledModules: string[];
      localeDefault: string;
    }>,
  ): Promise<ContentProjectRecord | null>;
  delete(id: string, ownerUserId: string): Promise<boolean>;
  findPersonalWorkspaceId(ownerUserId: string): Promise<string | null>;
}

export interface SocialAccountRepository {
  listByProject(projectId: string): Promise<SocialAccountRecord[]>;
  findByIdForProject(id: string, projectId: string): Promise<SocialAccountRecord | null>;
  create(input: {
    projectId: string;
    platform: SocialPlatform;
    displayName: string;
    status: SocialAccountStatus;
    externalAccountId: string | null;
  }): Promise<SocialAccountRecord>;
  update(
    id: string,
    projectId: string,
    patch: Partial<{
      displayName: string;
      status: SocialAccountStatus;
      externalAccountId: string | null;
    }>,
  ): Promise<SocialAccountRecord | null>;
  delete(id: string, projectId: string): Promise<boolean>;
  getSecrets(socialAccountId: string): Promise<SocialCredentialSecrets | null>;
  upsertSecrets(socialAccountId: string, secrets: SocialCredentialSecrets): Promise<void>;
  deleteSecrets(socialAccountId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface TokenService {
  sign(payload: { sub: string; email: string }): Promise<string>;
  verify(token: string): Promise<{ sub: string; email: string }>;
}

/** Encrypt/decrypt social credential payloads (MVP vault). */
export interface CredentialVault {
  encrypt(secrets: SocialCredentialSecrets): string;
  decrypt(ciphertext: string): SocialCredentialSecrets;
}

export interface ManualPublishRequest {
  platform: SocialPlatform;
  displayName: string;
  caption?: string;
  mediaHint?: string;
}

export interface ManualPublishResult {
  status: "MANUAL_REQUIRED";
  checklist: string[];
}

/** Port for social publishing — ManualPublisher first (ADR-006). */
export interface SocialPublisher {
  publish(request: ManualPublishRequest): Promise<ManualPublishResult>;
}
