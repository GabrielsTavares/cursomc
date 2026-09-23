import type { ProjectType } from "@creator-hub/shared-types";
import type { ContentProjectRecord, UserRecord } from "../domain/models.js";

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
  findPersonalWorkspaceId(ownerUserId: string): Promise<string | null>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface TokenService {
  sign(payload: { sub: string; email: string }): Promise<string>;
  verify(token: string): Promise<{ sub: string; email: string }>;
}
