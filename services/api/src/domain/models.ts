import type { ContentProject, ProjectType, User } from "@creator-hub/shared-types";

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

export const PROJECT_TYPES: ProjectType[] = [
  "CREATOR",
  "PET",
  "AFFILIATE",
  "BRAND",
  "OTHER",
];
