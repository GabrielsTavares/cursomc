import { readFile } from "node:fs/promises";
import type { PublishCommand, PublishResult, SocialPublisher } from "../../application/ports.js";

export interface InstagramPublisherOptions {
  graphVersion: string;
  /** Optional public base for video_url flow (rarely used with local storage). */
  publicBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Instagram Content Publishing (Reels) via Meta Graph API.
 * Docs:
 * - https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
 * - https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
 *
 * Prerequisites: IG professional account linked to a Facebook Page; token with
 * instagram_content_publish (or instagram_business_content_publish); IG user id
 * stored in SocialAccount.externalAccountId.
 *
 * Local media: uses resumable upload (Meta fetches local binary via rupload),
 * not a public video_url (LocalStorage has no public CDN in this PR).
 */
export class InstagramPublisher implements SocialPublisher {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: InstagramPublisherOptions) {
    this.fetch = options.fetchImpl ?? fetch;
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    if (command.dryRun) {
      return {
        status: "PUBLISHED",
        externalPostId: `dry_run_ig_${command.publicationId.slice(0, 8)}`,
      };
    }

    const accessToken = command.credentials.accessToken?.trim();
    const igUserId = command.externalAccountId?.trim();
    if (!accessToken) {
      return {
        status: "FAILED",
        errorMessage:
          "Instagram: falta access token na conta. Cola um Page/User token com publish.",
      };
    }
    if (!igUserId) {
      return {
        status: "FAILED",
        errorMessage:
          "Instagram: preenche “ID externo” com o IG User ID (Graph) da conta profissional.",
      };
    }
    if (command.mediaType !== "VIDEO") {
      return {
        status: "FAILED",
        errorMessage: "Instagram Reels via API: este episódio precisa de um vídeo.",
      };
    }

    const version = this.options.graphVersion || "v21.0";
    const base = `https://graph.facebook.com/${version}`;

    try {
      const videoBytes = await readFile(command.mediaAbsolutePath);
      const containerId = await this.createResumableContainer(
        base,
        igUserId,
        accessToken,
        command.caption ?? "",
      );
      await this.uploadBinary(version, containerId, accessToken, videoBytes);
      await this.waitUntilFinished(base, containerId, accessToken);
      const mediaId = await this.publishContainer(base, igUserId, accessToken, containerId);
      return {
        status: "PUBLISHED",
        externalPostId: mediaId,
      };
    } catch (err) {
      return {
        status: "FAILED",
        errorMessage: humanIgError(err),
      };
    }
  }

  private async createResumableContainer(
    base: string,
    igUserId: string,
    accessToken: string,
    caption: string,
  ): Promise<string> {
    const url = new URL(`${base}/${igUserId}/media`);
    url.searchParams.set("media_type", "REELS");
    url.searchParams.set("upload_type", "resumable");
    url.searchParams.set("caption", caption);
    url.searchParams.set("access_token", accessToken);

    const res = await this.fetch(url.toString(), { method: "POST" });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      throw new Error(json.error?.message ?? `criar container falhou (${res.status})`);
    }
    return json.id;
  }

  private async uploadBinary(
    version: string,
    containerId: string,
    accessToken: string,
    videoBytes: Buffer,
  ): Promise<void> {
    const uploadUrl = `https://rupload.facebook.com/ig-api-upload/${version}/${containerId}`;
    const res = await this.fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${accessToken}`,
        offset: "0",
        file_size: String(videoBytes.byteLength),
        "Content-Type": "application/octet-stream",
      },
      body: videoBytes,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`upload resumable falhou (${res.status}): ${text.slice(0, 200)}`);
    }
  }

  private async waitUntilFinished(
    base: string,
    containerId: string,
    accessToken: string,
  ): Promise<void> {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const url = new URL(`${base}/${containerId}`);
      url.searchParams.set("fields", "status_code,status");
      url.searchParams.set("access_token", accessToken);
      const res = await this.fetch(url.toString());
      const json = (await res.json()) as {
        status_code?: string;
        status?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(json.error?.message ?? `poll container falhou (${res.status})`);
      }
      const code = json.status_code ?? "";
      if (code === "FINISHED") return;
      if (code === "ERROR" || code === "EXPIRED") {
        throw new Error(`container IG status=${code}: ${json.status ?? "erro de processamento"}`);
      }
      await sleep(2000);
    }
    throw new Error("Timeout à espera do processamento do Reel (container não ficou FINISHED).");
  }

  private async publishContainer(
    base: string,
    igUserId: string,
    accessToken: string,
    containerId: string,
  ): Promise<string> {
    const url = new URL(`${base}/${igUserId}/media_publish`);
    url.searchParams.set("creation_id", containerId);
    url.searchParams.set("access_token", accessToken);
    const res = await this.fetch(url.toString(), { method: "POST" });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      throw new Error(json.error?.message ?? `media_publish falhou (${res.status})`);
    }
    return json.id;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanIgError(err: unknown): string {
  if (err instanceof Error) {
    return `Instagram: ${err.message}. Conta profissional + Page + scopes de Content Publishing.`;
  }
  return "Instagram: erro inesperado ao publicar";
}
