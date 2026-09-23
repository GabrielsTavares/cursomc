export type UserId = string & { readonly __brand: "UserId" };
export type WorkspaceId = string & { readonly __brand: "WorkspaceId" };
export type ContentProjectId = string & { readonly __brand: "ContentProjectId" };
export type SocialAccountId = string & { readonly __brand: "SocialAccountId" };

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

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
