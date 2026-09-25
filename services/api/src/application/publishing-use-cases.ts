import type {
  CreateScheduleRequest,
  ScheduledPublication,
  ScheduleTargetInput,
} from "@creator-hub/shared-types";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { toPublicPublication } from "../domain/models.js";
import type {
  EpisodeRepository,
  MediaAssetRepository,
  MediaStorage,
  ProjectRepository,
  PublicationRepository,
  PublisherRegistry,
  SocialAccountRepository,
} from "./ports.js";

async function assertOwnsProject(
  projects: ProjectRepository,
  ownerUserId: string,
  projectId: string,
) {
  const project = await projects.findByIdForOwner(projectId, ownerUserId);
  if (!project) throw new NotFoundError("Projeto não encontrado");
  return project;
}

function parseScheduledAt(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`Data/hora inválida: ${value}`);
  }
  return d;
}

export class ListPublicationsUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly publications: PublicationRepository,
  ) {}

  async execute(ownerUserId: string, projectId: string): Promise<ScheduledPublication[]> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const rows = await this.publications.listByProject(projectId);
    return rows.map(toPublicPublication);
  }
}

export class CreateScheduleUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly episodes: EpisodeRepository,
    private readonly socialAccounts: SocialAccountRepository,
    private readonly mediaAssets: MediaAssetRepository,
    private readonly publications: PublicationRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    input: CreateScheduleRequest,
  ): Promise<ScheduledPublication[]> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);

    if (!input.episodeId?.trim()) {
      throw new ValidationError("Seleciona um conteúdo (episode).");
    }
    if (!Array.isArray(input.targets) || input.targets.length === 0) {
      throw new ValidationError("Adiciona pelo menos uma plataforma / horário.");
    }

    const episode = await this.episodes.findByIdForProject(input.episodeId, projectId);
    if (!episode) throw new NotFoundError("Conteúdo não encontrado");

    const media = await this.mediaAssets.listByEpisode(episode.id);
    if (media.length === 0) {
      throw new ValidationError("Este conteúdo ainda não tem mídia — faz upload antes de agendar.");
    }

    const rows = [];
    const seenAccounts = new Set<string>();
    for (const target of input.targets) {
      const row = await this.buildRow(projectId, episode.id, target, seenAccounts);
      rows.push(row);
    }

    const created = await this.publications.createMany(rows);
    return created.map(toPublicPublication);
  }

  private async buildRow(
    projectId: string,
    episodeId: string,
    target: ScheduleTargetInput,
    seenAccounts: Set<string>,
  ) {
    if (!target.socialAccountId?.trim()) {
      throw new ValidationError("Cada alvo precisa de socialAccountId.");
    }
    if (seenAccounts.has(target.socialAccountId)) {
      throw new ValidationError("Não agendes a mesma conta duas vezes no mesmo pedido.");
    }
    seenAccounts.add(target.socialAccountId);

    const account = await this.socialAccounts.findByIdForProject(
      target.socialAccountId,
      projectId,
    );
    if (!account) {
      throw new ValidationError(`Conta social inválida: ${target.socialAccountId}`);
    }

    const scheduledAt = parseScheduledAt(target.scheduledAt);
    return {
      projectId,
      episodeId,
      platform: account.platform,
      socialAccountId: account.id,
      scheduledAt,
      caption: target.caption?.trim() ? target.caption.trim() : null,
      status: "SCHEDULED" as const,
    };
  }
}

export class CancelPublicationUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly publications: PublicationRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    publicationId: string,
  ): Promise<ScheduledPublication> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const existing = await this.publications.findByIdForProject(publicationId, projectId);
    if (!existing) throw new NotFoundError("Agendamento não encontrado");
    if (existing.status === "PUBLISHED") {
      throw new ValidationError("Já publicado — não dá para cancelar.");
    }
    if (existing.status === "PUBLISHING") {
      throw new ValidationError("Publicação em curso — espera ou tenta mais tarde.");
    }
    if (existing.status === "CANCELLED") {
      return toPublicPublication(existing);
    }
    const updated = await this.publications.update(publicationId, {
      status: "CANCELLED",
      errorMessage: null,
    });
    if (!updated) throw new NotFoundError("Agendamento não encontrado");
    return toPublicPublication(updated);
  }
}

export class RetryPublicationUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly publications: PublicationRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    publicationId: string,
  ): Promise<ScheduledPublication> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const existing = await this.publications.findByIdForProject(publicationId, projectId);
    if (!existing) throw new NotFoundError("Agendamento não encontrado");
    if (existing.status !== "FAILED" && existing.status !== "MANUAL_REQUIRED") {
      throw new ValidationError("Só podes repetir agendamentos FAILED ou MANUAL_REQUIRED.");
    }
    const updated = await this.publications.update(publicationId, {
      status: "SCHEDULED",
      scheduledAt: new Date(),
      errorMessage: null,
      checklist: null,
      publishAttemptId: null,
      externalPostId: existing.externalPostId,
    });
    if (!updated) throw new NotFoundError("Agendamento não encontrado");
    return toPublicPublication(updated);
  }
}

export class MarkPublishedUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly publications: PublicationRepository,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    publicationId: string,
    externalPostId?: string,
  ): Promise<ScheduledPublication> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const existing = await this.publications.findByIdForProject(publicationId, projectId);
    if (!existing) throw new NotFoundError("Agendamento não encontrado");
    if (existing.status === "CANCELLED") {
      throw new ValidationError("Agendamento cancelado.");
    }
    const updated = await this.publications.update(publicationId, {
      status: "PUBLISHED",
      errorMessage: null,
      checklist: null,
      externalPostId: externalPostId?.trim() || existing.externalPostId || "manual",
    });
    if (!updated) throw new NotFoundError("Agendamento não encontrado");
    return toPublicPublication(updated);
  }
}

/** Force due now and leave for scheduler, or claim+publish immediately via runner. */
export class PublishNowUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly publications: PublicationRepository,
    private readonly runner: PublishDuePublicationsUseCase,
  ) {}

  async execute(
    ownerUserId: string,
    projectId: string,
    publicationId: string,
  ): Promise<ScheduledPublication> {
    await assertOwnsProject(this.projects, ownerUserId, projectId);
    const existing = await this.publications.findByIdForProject(publicationId, projectId);
    if (!existing) throw new NotFoundError("Agendamento não encontrado");
    if (existing.status === "PUBLISHED") {
      return toPublicPublication(existing);
    }
    if (existing.status === "CANCELLED") {
      throw new ValidationError("Agendamento cancelado.");
    }
    if (existing.status === "PUBLISHING") {
      throw new ValidationError("Já está a publicar.");
    }

    await this.publications.update(publicationId, {
      status: "SCHEDULED",
      scheduledAt: new Date(0),
      errorMessage: null,
      publishAttemptId: null,
    });

    await this.runner.executeOne(publicationId);
    const fresh = await this.publications.findByIdForProject(publicationId, projectId);
    if (!fresh) throw new NotFoundError("Agendamento não encontrado");
    return toPublicPublication(fresh);
  }
}

export class PublishDuePublicationsUseCase {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly socialAccounts: SocialAccountRepository,
    private readonly mediaAssets: MediaAssetRepository,
    private readonly mediaStorage: MediaStorage,
    private readonly publishers: PublisherRegistry,
    private readonly options: { dryRun: boolean; batchSize: number },
  ) {}

  async execute(): Promise<{ claimed: number; processed: number }> {
    const attemptId = crypto.randomUUID();
    const claimed = await this.publications.claimDue(this.options.batchSize, attemptId);
    for (const row of claimed) {
      await this.processClaimed(row);
    }
    return { claimed: claimed.length, processed: claimed.length };
  }

  /** Claim a specific id if still SCHEDULED (used by publish-now). */
  async executeOne(publicationId: string): Promise<void> {
    const attemptId = crypto.randomUUID();
    // Re-read; claimDue only picks due SCHEDULED — force by claiming via update if needed
    const existing = await this.publications.update(publicationId, {
      status: "PUBLISHING",
      publishAttemptId: attemptId,
      errorMessage: null,
    });
    if (!existing) return;
    // Idempotency: if somehow already published between reads
    if (existing.status === "PUBLISHED") return;
    await this.processClaimed(existing);
  }

  private async processClaimed(
    row: Awaited<ReturnType<PublicationRepository["claimDue"]>>[number],
  ): Promise<void> {
    try {
      const account = await this.socialAccounts.findByIdForProject(
        row.socialAccountId,
        row.projectId,
      );
      if (!account) {
        await this.publications.update(row.id, {
          status: "FAILED",
          errorMessage: "Conta social vinculada foi removida.",
        });
        return;
      }

      const mediaList = await this.mediaAssets.listByEpisode(row.episodeId);
      const primary =
        mediaList.find((m) => m.type === "VIDEO") ??
        mediaList.find((m) => m.type === "IMAGE") ??
        mediaList[0];
      if (!primary) {
        await this.publications.update(row.id, {
          status: "FAILED",
          errorMessage: "Sem mídia no episódio para publicar.",
        });
        return;
      }

      const secrets = (await this.socialAccounts.getSecrets(account.id)) ?? {};
      const absolutePath = this.mediaStorage.resolvePath(primary.storageKey);
      const publisher = this.publishers.resolve(row.platform);
      const result = await publisher.publish({
        publicationId: row.id,
        platform: row.platform,
        caption: row.caption ?? "",
        mediaAbsolutePath: absolutePath,
        mime: primary.mime,
        mediaType: primary.type,
        credentials: secrets,
        externalAccountId: account.externalAccountId,
        accountDisplayName: account.displayName,
        dryRun: this.options.dryRun,
      });

      if (result.status === "PUBLISHED") {
        await this.publications.update(row.id, {
          status: "PUBLISHED",
          externalPostId: result.externalPostId ?? null,
          errorMessage: null,
          checklist: null,
        });
        return;
      }
      if (result.status === "MANUAL_REQUIRED") {
        await this.publications.update(row.id, {
          status: "MANUAL_REQUIRED",
          externalPostId: result.externalPostId ?? null,
          checklist: result.checklist ?? null,
          errorMessage: null,
        });
        return;
      }
      await this.publications.update(row.id, {
        status: "FAILED",
        errorMessage: result.errorMessage ?? "Falha ao publicar",
        checklist: result.checklist ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado no publish";
      await this.publications.update(row.id, {
        status: "FAILED",
        errorMessage: message,
      });
    }
  }
}
