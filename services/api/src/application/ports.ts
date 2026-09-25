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

export interface EpisodeRepository {
  listByProject(projectId: string): Promise<EpisodeRecord[]>;
  findByIdForProject(id: string, projectId: string): Promise<EpisodeRecord | null>;
  create(input: {
    projectId: string;
    title: string;
    contentKind: ContentKind;
    status: EpisodeStatus;
    locale: string;
    hook: string | null;
    description: string | null;
    targetDurationSeconds: number | null;
  }): Promise<EpisodeRecord>;
  delete(id: string, projectId: string): Promise<boolean>;
  countMediaByEpisodeIds(episodeIds: string[]): Promise<Map<string, number>>;
}

export interface MediaAssetRepository {
  listByProject(projectId: string): Promise<MediaAssetRecord[]>;
  listByEpisode(episodeId: string): Promise<MediaAssetRecord[]>;
  findByIdForProject(id: string, projectId: string): Promise<MediaAssetRecord | null>;
  create(input: {
    projectId: string;
    episodeId: string | null;
    type: MediaAssetType;
    storageKey: string;
    mime: string;
    sizeBytes: number;
    checksum: string | null;
    originalFilename: string | null;
    sortOrder: number;
  }): Promise<MediaAssetRecord>;
  delete(id: string, projectId: string): Promise<MediaAssetRecord | null>;
  nextSortOrder(episodeId: string): Promise<number>;
}

export interface PublicationRepository {
  listByProject(projectId: string): Promise<ScheduledPublicationRecord[]>;
  findByIdForProject(id: string, projectId: string): Promise<ScheduledPublicationRecord | null>;
  createMany(
    rows: Array<{
      projectId: string;
      episodeId: string;
      platform: SocialPlatform;
      socialAccountId: string;
      scheduledAt: Date;
      caption: string | null;
      status: PublicationStatus;
    }>,
  ): Promise<ScheduledPublicationRecord[]>;
  update(
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
  ): Promise<ScheduledPublicationRecord | null>;
  /**
   * Atomically claim due SCHEDULED rows (FOR UPDATE SKIP LOCKED).
   * Returns claimed rows now in PUBLISHING with publishAttemptId set.
   */
  claimDue(limit: number, attemptId: string, now?: Date): Promise<ScheduledPublicationRecord[]>;
}

export interface StoredMediaObject {
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  absolutePath: string;
}

/** Port: store/get/delete bytes; returns logical URI (storage key). */
export interface MediaStorage {
  store(input: {
    projectId: string;
    originalFilename: string | null;
    mime: string;
    body: Buffer;
  }): Promise<StoredMediaObject>;
  resolvePath(storageKey: string): string;
  delete(storageKey: string): Promise<void>;
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

export interface PublishCommand {
  publicationId: string;
  platform: SocialPlatform;
  caption: string;
  mediaAbsolutePath: string;
  mime: string;
  mediaType: MediaAssetType;
  credentials: SocialCredentialSecrets;
  /** TikTok open_id / Instagram IG user id / etc. */
  externalAccountId: string | null;
  accountDisplayName: string;
  dryRun: boolean;
}

export type PublishOutcomeStatus = "PUBLISHED" | "FAILED" | "MANUAL_REQUIRED";

export interface PublishResult {
  status: PublishOutcomeStatus;
  externalPostId?: string | null;
  errorMessage?: string | null;
  checklist?: string[];
}

/** Port for social publishing — one adapter per platform (+ Fake/Manual). */
export interface SocialPublisher {
  publish(command: PublishCommand): Promise<PublishResult>;
}

export interface PublisherRegistry {
  resolve(platform: SocialPlatform): SocialPublisher;
}
