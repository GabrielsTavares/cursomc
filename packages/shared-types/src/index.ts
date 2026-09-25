export type UserId = string & { readonly __brand: "UserId" };
export type WorkspaceId = string & { readonly __brand: "WorkspaceId" };
export type ContentProjectId = string & { readonly __brand: "ContentProjectId" };
export type SocialAccountId = string & { readonly __brand: "SocialAccountId" };
export type EpisodeId = string & { readonly __brand: "EpisodeId" };
export type MediaAssetId = string & { readonly __brand: "MediaAssetId" };

export type ProjectType =
  | "CREATOR"
  | "PET"
  | "AFFILIATE"
  | "BRAND"
  | "OTHER";

export type SocialPlatform =
  | "TIKTOK"
  | "INSTAGRAM"
  | "YOUTUBE"
  | "KWAI"
  | "FACEBOOK"
  | "OTHER";

export type SocialAccountStatus = "CONNECTED" | "NEEDS_CREDENTIALS" | "MANUAL";

/** MVP content kinds: single video, single photo, or ordered image sequence. */
export type ContentKind = "VIDEO" | "IMAGE" | "CAROUSEL";

export type EpisodeStatus =
  | "DRAFT"
  | "SCRIPTED"
  | "AUDIO_READY"
  | "RENDERED"
  | "QA_OK"
  | "READY_TO_POST"
  | "COMPLETED";

export type MediaAssetType = "AUDIO" | "VIDEO" | "IMAGE" | "THUMBNAIL" | "OTHER";

export interface User {
  id: UserId;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface ContentProject {
  id: ContentProjectId;
  workspaceId: WorkspaceId | null;
  ownerUserId: UserId;
  name: string;
  projectType: ProjectType;
  enabledModules: string[];
  localeDefault: string;
  createdAt: string;
}

/** Secrets never leave the API as plaintext after save — only masks. */
export interface SocialCredentialMasks {
  accessToken: string | null;
  refreshToken: string | null;
  clientId: string | null;
  clientSecret: string | null;
  apiKey: string | null;
  hasExtraJson: boolean;
}

export interface SocialAccount {
  id: SocialAccountId;
  projectId: ContentProjectId;
  platform: SocialPlatform;
  displayName: string;
  status: SocialAccountStatus;
  externalAccountId: string | null;
  credentials: SocialCredentialMasks;
  createdAt: string;
  updatedAt: string;
}

export interface SocialCredentialsInput {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  extraJson?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  checks: {
    database: "up" | "down";
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface AuthUserResponse {
  user: User;
}

export interface ProjectsResponse {
  projects: ContentProject[];
}

export interface CreateProjectRequest {
  name: string;
  projectType?: ProjectType;
  localeDefault?: string;
  enabledModules?: string[];
}

export interface UpdateProjectRequest {
  name?: string;
  projectType?: ProjectType;
  localeDefault?: string;
  enabledModules?: string[];
}

export interface SocialAccountsResponse {
  socialAccounts: SocialAccount[];
}

export interface CreateSocialAccountRequest {
  platform: SocialPlatform;
  displayName: string;
  status?: SocialAccountStatus;
  externalAccountId?: string;
  credentials?: SocialCredentialsInput;
}

export interface UpdateSocialAccountRequest {
  displayName?: string;
  status?: SocialAccountStatus;
  externalAccountId?: string | null;
  /** Partial update: blank strings are ignored; omit keys to leave unchanged. */
  credentials?: SocialCredentialsInput;
}

export interface Episode {
  id: EpisodeId;
  projectId: ContentProjectId;
  title: string;
  contentKind: ContentKind;
  status: EpisodeStatus;
  locale: string;
  hook: string | null;
  description: string | null;
  targetDurationSeconds: number | null;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: MediaAssetId;
  projectId: ContentProjectId;
  episodeId: EpisodeId | null;
  type: MediaAssetType;
  mime: string;
  sizeBytes: number;
  originalFilename: string | null;
  sortOrder: number;
  /** Relative download URL under the API (auth required). */
  downloadUrl: string;
  createdAt: string;
}

export interface EpisodesResponse {
  episodes: Episode[];
}

export interface CreateEpisodeRequest {
  title: string;
  contentKind: ContentKind;
  locale?: string;
  hook?: string;
  description?: string;
  targetDurationSeconds?: number;
}

export interface MediaLibraryResponse {
  media: MediaAsset[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
