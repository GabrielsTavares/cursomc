import type { ContentProject, CreateProjectRequest, UpdateProjectRequest } from "@creator-hub/shared-types";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { PROJECT_TYPES, toPublicProject } from "../domain/models.js";
import type { ProjectRepository } from "./ports.js";

function assertProjectType(value: string | undefined) {
  if (value === undefined) return;
  if (!PROJECT_TYPES.includes(value as (typeof PROJECT_TYPES)[number])) {
    throw new ValidationError(`Invalid projectType: ${value}`);
  }
}

export class ListProjectsUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(ownerUserId: string): Promise<ContentProject[]> {
    const rows = await this.projects.listByOwner(ownerUserId);
    return rows.map(toPublicProject);
  }
}

export class CreateProjectUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(ownerUserId: string, input: CreateProjectRequest): Promise<ContentProject> {
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Project name is required");
    }
    assertProjectType(input.projectType);

    const workspaceId = await this.projects.findPersonalWorkspaceId(ownerUserId);
    const created = await this.projects.create({
      ownerUserId,
      workspaceId,
      name,
      projectType: input.projectType ?? "CREATOR",
      enabledModules: input.enabledModules ?? [],
      localeDefault: input.localeDefault ?? "pt-BR",
    });
    return toPublicProject(created);
  }
}

export class GetProjectUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(ownerUserId: string, projectId: string): Promise<ContentProject> {
    const project = await this.projects.findByIdForOwner(projectId, ownerUserId);
    if (!project) {
      throw new NotFoundError("Project not found");
    }
    return toPublicProject(project);
  }
}

export class UpdateProjectUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    input: UpdateProjectRequest,
  ): Promise<ContentProject> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new ValidationError("Project name cannot be empty");
    }
    assertProjectType(input.projectType);

    const updated = await this.projects.update(projectId, ownerUserId, {
      name: input.name?.trim(),
      projectType: input.projectType,
      enabledModules: input.enabledModules,
      localeDefault: input.localeDefault,
    });
    if (!updated) {
      throw new NotFoundError("Project not found");
    }
    return toPublicProject(updated);
  }
}

export class DeleteProjectUseCase {
  constructor(private readonly projects: ProjectRepository) {}

  async execute(ownerUserId: string, projectId: string): Promise<void> {
    const deleted = await this.projects.delete(projectId, ownerUserId);
    if (!deleted) {
      throw new NotFoundError("Project not found");
    }
  }
}
