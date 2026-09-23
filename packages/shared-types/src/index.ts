export type UserId = string & { readonly __brand: "UserId" };
export type WorkspaceId = string & { readonly __brand: "WorkspaceId" };
export type ContentProjectId = string & { readonly __brand: "ContentProjectId" };

export type ProjectType =
  | "CREATOR"
  | "PET"
  | "AFFILIATE"
  | "BRAND"
  | "OTHER";

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

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}
