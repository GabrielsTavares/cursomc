import type { ManualPublishRequest, ManualPublishResult, SocialPublisher } from "../../application/ports.js";

/**
 * Stub publisher (ADR-006): never calls external APIs.
 * Marks work as MANUAL_REQUIRED with a human checklist.
 */
export class ManualPublisher implements SocialPublisher {
  async publish(request: ManualPublishRequest): Promise<ManualPublishResult> {
    return {
      status: "MANUAL_REQUIRED",
      checklist: [
        `Abrir a app / studio de ${request.platform}`,
        `Conta: ${request.displayName}`,
        request.mediaHint
          ? `Carregar mídia: ${request.mediaHint}`
          : "Carregar o ficheiro de mídia exportado pelo Hub",
        request.caption ? `Colar legenda: ${request.caption}` : "Colar a legenda gerada no Hub",
        "Publicar e marcar o episódio como feito no Hub",
      ],
    };
  }
}
