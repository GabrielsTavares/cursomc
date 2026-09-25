import { readFile, stat } from "node:fs/promises";
import type { PublishCommand, PublishResult, SocialPublisher } from "../../application/ports.js";

export type TikTokPostMode = "inbox" | "direct";

export interface TikTokPublisherOptions {
  clientKey?: string;
  clientSecret?: string;
  postMode: TikTokPostMode;
  fetchImpl?: typeof fetch;
}

/**
 * TikTok Content Posting API
 * Docs:
 * - https://developers.tiktok.com/doc/content-posting-api-get-started
 * - https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content (inbox / video.upload)
 * - https://developers.tiktok.com/doc/content-posting-api-reference-direct-post (direct / video.publish)
 *
 * Uses access token from SocialAccount (paste). OAuth Login Kit = passo 2.
 */
export class TikTokPublisher implements SocialPublisher {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: TikTokPublisherOptions) {
    this.fetch = options.fetchImpl ?? fetch;
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    if (command.dryRun) {
      return {
        status: "PUBLISHED",
        externalPostId: `dry_run_tiktok_${command.publicationId.slice(0, 8)}`,
      };
    }

    const accessToken = command.credentials.accessToken?.trim();
    if (!accessToken) {
      return {
        status: "FAILED",
        errorMessage:
          "TikTok: falta access token na conta social. Cola o token (Login Kit) ou usa dry_run.",
      };
    }

    if (command.mediaType !== "VIDEO") {
      return {
        status: "FAILED",
        errorMessage: "TikTok Content Posting (vídeo): este episódio precisa de um ficheiro de vídeo.",
      };
    }

    try {
      const fileStat = await stat(command.mediaAbsolutePath);
      const videoSize = fileStat.size;
      const videoBytes = await readFile(command.mediaAbsolutePath);
      const mime = command.mime.includes("quicktime")
        ? "video/quicktime"
        : command.mime.includes("webm")
          ? "video/webm"
          : "video/mp4";

      if (this.options.postMode === "direct") {
        return await this.directPost(accessToken, command, videoSize, videoBytes, mime);
      }
      return await this.inboxUpload(accessToken, command, videoSize, videoBytes, mime);
    } catch (err) {
      return {
        status: "FAILED",
        errorMessage: humanTikTokError(err),
      };
    }
  }

  /** Inbox / draft — scope video.upload. User finishes in TikTok app. */
  private async inboxUpload(
    accessToken: string,
    command: PublishCommand,
    videoSize: number,
    videoBytes: Buffer,
    mime: string,
  ): Promise<PublishResult> {
    const initRes = await this.fetch(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }),
      },
    );
    const initJson = (await initRes.json()) as TikTokInitResponse;
    if (!initRes.ok || initJson.error?.code !== "ok" || !initJson.data?.upload_url) {
      return {
        status: "FAILED",
        errorMessage: formatTikTokApiError("inbox init", initJson),
      };
    }

    const uploadOk = await this.putVideo(
      initJson.data.upload_url,
      videoBytes,
      mime,
      videoSize,
    );
    if (!uploadOk.ok) {
      return { status: "FAILED", errorMessage: uploadOk.error };
    }

    return {
      status: "MANUAL_REQUIRED",
      externalPostId: initJson.data.publish_id ?? null,
      checklist: [
        "TikTok: o vídeo foi enviado para a inbox (Content Posting API — video.upload)",
        `Conta: ${command.accountDisplayName}`,
        "Abre o TikTok → notificações / inbox e completa a edição + publicar",
        command.caption ? `Sugestão de legenda: ${command.caption}` : "Cola a legenda do Hub",
        "Quando estiver live no TikTok, no Hub clica “Marquei como publicado”",
        "Para Direct Post (sem passo no app) precisas de scope video.publish + TIKTOK_POST_MODE=direct",
      ],
    };
  }

  /** Direct Post — scope video.publish + app review. Unaudited clients: SELF_ONLY only. */
  private async directPost(
    accessToken: string,
    command: PublishCommand,
    videoSize: number,
    videoBytes: Buffer,
    mime: string,
  ): Promise<PublishResult> {
    const privacyLevel = parsePrivacy(command.credentials.extraJson) ?? "SELF_ONLY";
    const title = (command.caption ?? "").slice(0, 2200);

    const initRes = await this.fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level: privacyLevel,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }),
      },
    );
    const initJson = (await initRes.json()) as TikTokInitResponse;
    if (!initRes.ok || initJson.error?.code !== "ok" || !initJson.data?.upload_url) {
      return {
        status: "FAILED",
        errorMessage: formatTikTokApiError("direct init", initJson),
      };
    }

    const uploadOk = await this.putVideo(
      initJson.data.upload_url,
      videoBytes,
      mime,
      videoSize,
    );
    if (!uploadOk.ok) {
      return { status: "FAILED", errorMessage: uploadOk.error };
    }

    return {
      status: "PUBLISHED",
      externalPostId: initJson.data.publish_id ?? null,
    };
  }

  private async putVideo(
    uploadUrl: string,
    videoBytes: Buffer,
    mime: string,
    videoSize: number,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const putRes = await this.fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "Content-Length": String(videoSize),
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      body: videoBytes,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      return {
        ok: false,
        error: `TikTok upload PUT falhou (${putRes.status}): ${text.slice(0, 200)}`,
      };
    }
    return { ok: true };
  }
}

interface TikTokInitResponse {
  data?: { publish_id?: string; upload_url?: string };
  error?: { code?: string; message?: string; log_id?: string };
}

function formatTikTokApiError(step: string, json: TikTokInitResponse): string {
  const code = json.error?.code ?? "unknown";
  const message = json.error?.message ?? "sem detalhe";
  return `TikTok ${step}: ${code} — ${message}. Verifica scopes (video.upload / video.publish) e app review.`;
}

function humanTikTokError(err: unknown): string {
  if (err instanceof Error) return `TikTok: ${err.message}`;
  return "TikTok: erro inesperado ao publicar";
}

function parsePrivacy(extraJson: string | undefined): string | null {
  if (!extraJson?.trim()) return null;
  try {
    const parsed = JSON.parse(extraJson) as { privacy_level?: string };
    return parsed.privacy_level ?? null;
  } catch {
    return null;
  }
}
