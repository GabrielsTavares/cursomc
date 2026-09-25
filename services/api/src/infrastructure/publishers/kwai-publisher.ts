import type { PublishCommand, PublishResult, SocialPublisher } from "../../application/ports.js";
import { ManualPublisher } from "./manual-publisher.js";

/**
 * Kwai (Brasil): não há API pública estável de upload para criadores (confirmado 2026).
 * open.kuaishou.com (China) ≠ Kwai BR self-serve para o Gabriel.
 * Sempre MANUAL_REQUIRED + checklist — ver docs/creator-hub-publish-integracoes.md
 */
export class KwaiPublisher implements SocialPublisher {
  private readonly manual = new ManualPublisher();

  async publish(command: PublishCommand): Promise<PublishResult> {
    if (command.dryRun) {
      return {
        status: "PUBLISHED",
        externalPostId: `dry_run_kwai_${command.publicationId.slice(0, 8)}`,
      };
    }

    const base = await this.manual.publish(command);
    return {
      ...base,
      checklist: [
        "Abrir o app Kwai no telemóvel (conta de criador BR)",
        `Conta Hub: ${command.accountDisplayName}`,
        "Criar → Upload → selecionar o MP4 9:16 exportado / ficheiro do Hub",
        command.caption ? `Colar legenda: ${command.caption}` : "Colar a legenda do Hub",
        "Publicar no Kwai",
        "Voltar ao Creator Hub → “Marquei como publicado” neste agendamento",
        "Nota: não existe API oficial pública de posting para Kwai BR — fluxo manual de propósito",
      ],
    };
  }
}
