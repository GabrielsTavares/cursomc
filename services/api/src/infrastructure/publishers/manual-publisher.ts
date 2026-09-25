import type { PublishCommand, PublishResult, SocialPublisher } from "../../application/ports.js";

/**
 * Marks MANUAL_REQUIRED with a human checklist (Kwai BR, YouTube stub, fallback).
 * Never invents undocumented APIs.
 */
export class ManualPublisher implements SocialPublisher {
  async publish(command: PublishCommand): Promise<PublishResult> {
    if (command.dryRun) {
      return {
        status: "PUBLISHED",
        externalPostId: `dry_run_manual_${command.publicationId.slice(0, 8)}`,
      };
    }

    return {
      status: "MANUAL_REQUIRED",
      checklist: [
        `Abrir a app / studio de ${command.platform}`,
        `Conta: ${command.accountDisplayName}`,
        `Carregar mídia local: ${command.mediaAbsolutePath}`,
        command.caption
          ? `Colar legenda: ${command.caption}`
          : "Colar a legenda gerada no Hub",
        "Publicar na rede e no Hub clicar “Marquei como publicado”",
      ],
      errorMessage: null,
    };
  }
}
