import type {
  ContentKind,
  ContentProject,
  Episode,
  EpisodeStatus,
  MediaAsset,
  MediaAssetType,
  ProjectType,
  SocialAccount,
  SocialAccountStatus,
  SocialCredentialMasks,
  SocialPlatform,
  User,
} from "@creator-hub/shared-types";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
}

export interface ContentProjectRecord {
  id: string;
  workspaceId: string | null;
  ownerUserId: string;
  name: string;
  projectType: ProjectType;
  enabledModules: string[];
  localeDefault: string;
  createdAt: Date;
}

export interface SocialCredentialSecrets {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  extraJson?: string;
}

export interface SocialAccountRecord {
  id: string;
  projectId: string;
  platform: SocialPlatform;
  displayName: string;
  status: SocialAccountStatus;
  externalAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeRecord {
  id: string;
  projectId: string;
  title: string;
  contentKind: ContentKind;
  status: EpisodeStatus;
  locale: string;
  hook: string | null;
  description: string | null;
  targetDurationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAssetRecord {
  id: string;
  projectId: string;
  episodeId: string | null;
  type: MediaAssetType;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  checksum: string | null;
  originalFilename: string | null;
  sortOrder: number;
  createdAt: Date;
}

export function toPublicUser(user: UserRecord): User {
  return {
    id: user.id as User["id"],
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPublicProject(project: ContentProjectRecord): ContentProject {
  return {
    id: project.id as ContentProject["id"],
    workspaceId: (project.workspaceId ?? null) as ContentProject["workspaceId"],
    ownerUserId: project.ownerUserId as ContentProject["ownerUserId"],
    name: project.name,
    projectType: project.projectType,
    enabledModules: project.enabledModules,
    localeDefault: project.localeDefault,
    createdAt: project.createdAt.toISOString(),
  };
}

export function maskSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

export function toCredentialMasks(
  secrets: SocialCredentialSecrets | null,
): SocialCredentialMasks {
  return {
    accessToken: maskSecret(secrets?.accessToken),
    refreshToken: maskSecret(secrets?.refreshToken),
    clientId: maskSecret(secrets?.clientId),
    clientSecret: maskSecret(secrets?.clientSecret),
    apiKey: maskSecret(secrets?.apiKey),
    hasExtraJson: Boolean(secrets?.extraJson?.trim()),
  };
}

export function toPublicSocialAccount(
  account: SocialAccountRecord,
  secrets: SocialCredentialSecrets | null,
): SocialAccount {
  return {
    id: account.id as SocialAccount["id"],
    projectId: account.projectId as SocialAccount["projectId"],
    platform: account.platform,
    displayName: account.displayName,
    status: account.status,
    externalAccountId: account.externalAccountId,
    credentials: toCredentialMasks(secrets),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toPublicEpisode(episode: EpisodeRecord, mediaCount = 0): Episode {
  return {
    id: episode.id as Episode["id"],
    projectId: episode.projectId as Episode["projectId"],
    title: episode.title,
    contentKind: episode.contentKind,
    status: episode.status,
    locale: episode.locale,
    hook: episode.hook,
    description: episode.description,
    targetDurationSeconds: episode.targetDurationSeconds,
    mediaCount,
    createdAt: episode.createdAt.toISOString(),
    updatedAt: episode.updatedAt.toISOString(),
  };
}

export function mediaDownloadPath(projectId: string, mediaId: string): string {
  return `/api/v1/projects/${projectId}/media/${mediaId}/file`;
}

export function toPublicMediaAsset(asset: MediaAssetRecord): MediaAsset {
  return {
    id: asset.id as MediaAsset["id"],
    projectId: asset.projectId as MediaAsset["projectId"],
    episodeId: (asset.episodeId ?? null) as MediaAsset["episodeId"],
    type: asset.type,
    mime: asset.mime,
    sizeBytes: asset.sizeBytes,
    originalFilename: asset.originalFilename,
    sortOrder: asset.sortOrder,
    downloadUrl: mediaDownloadPath(asset.projectId, asset.id),
    createdAt: asset.createdAt.toISOString(),
  };
}

export function hasAnyCredential(secrets: SocialCredentialSecrets | null | undefined): boolean {
  if (!secrets) return false;
  return Boolean(
    secrets.accessToken?.trim() ||
      secrets.refreshToken?.trim() ||
      secrets.clientId?.trim() ||
      secrets.clientSecret?.trim() ||
      secrets.apiKey?.trim() ||
      secrets.extraJson?.trim(),
  );
}

export function mergeCredentials(
  existing: SocialCredentialSecrets | null,
  patch: SocialCredentialSecrets,
): SocialCredentialSecrets {
  const next: SocialCredentialSecrets = { ...(existing ?? {}) };
  const keys = [
    "accessToken",
    "refreshToken",
    "clientId",
    "clientSecret",
    "apiKey",
    "extraJson",
  ] as const;
  for (const key of keys) {
    const value = patch[key];
    if (value === undefined) continue;
    const trimmed = value.trim();
    if (!trimmed) continue; // blank = leave unchanged (UI placeholder)
    next[key] = trimmed;
  }
  return next;
}

export const PROJECT_TYPES: ProjectType[] = [
  "CREATOR",
  "PET",
  "AFFILIATE",
  "BRAND",
  "OTHER",
];

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  "TIKTOK",
  "INSTAGRAM",
  "YOUTUBE",
  "KWAI",
  "FACEBOOK",
  "OTHER",
];

export const SOCIAL_ACCOUNT_STATUSES: SocialAccountStatus[] = [
  "CONNECTED",
  "NEEDS_CREDENTIALS",
  "MANUAL",
];

export const CONTENT_KINDS: ContentKind[] = ["VIDEO", "IMAGE", "CAROUSEL"];

export const EPISODE_STATUSES: EpisodeStatus[] = [
  "DRAFT",
  "SCRIPTED",
  "AUDIO_READY",
  "RENDERED",
  "QA_OK",
  "READY_TO_POST",
  "COMPLETED",
];

export const MEDIA_ASSET_TYPES: MediaAssetType[] = [
  "AUDIO",
  "VIDEO",
  "IMAGE",
  "THUMBNAIL",
  "OTHER",
];

export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);
