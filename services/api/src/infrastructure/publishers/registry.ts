import type { SocialPlatform } from "@creator-hub/shared-types";
import type { PublisherRegistry, SocialPublisher } from "../../application/ports.js";
import type { AppConfig } from "../config.js";
import { FakePublisher } from "./fake-publisher.js";
import { InstagramPublisher } from "./instagram-publisher.js";
import { KwaiPublisher } from "./kwai-publisher.js";
import { ManualPublisher } from "./manual-publisher.js";
import { TikTokPublisher } from "./tiktok-publisher.js";

/**
 * Resolves SocialPublisher by platform.
 * When PUBLISH_MODE=dry_run, all platforms use FakePublisher (no network).
 */
export class DefaultPublisherRegistry implements PublisherRegistry {
  private readonly dryRun: boolean;
  private readonly fake = new FakePublisher();
  private readonly manual = new ManualPublisher();
  private readonly kwai = new KwaiPublisher();
  private readonly tiktok: TikTokPublisher;
  private readonly instagram: InstagramPublisher;

  constructor(config: AppConfig) {
    this.dryRun = config.PUBLISH_MODE === "dry_run";
    this.tiktok = new TikTokPublisher({
      clientKey: config.TIKTOK_CLIENT_KEY,
      clientSecret: config.TIKTOK_CLIENT_SECRET,
      postMode: config.TIKTOK_POST_MODE,
    });
    this.instagram = new InstagramPublisher({
      graphVersion: config.META_GRAPH_VERSION,
      publicBaseUrl: config.PUBLISH_PUBLIC_BASE_URL || undefined,
    });
  }

  resolve(platform: SocialPlatform): SocialPublisher {
    if (this.dryRun) return this.fake;
    switch (platform) {
      case "TIKTOK":
        return this.tiktok;
      case "INSTAGRAM":
        return this.instagram;
      case "KWAI":
        return this.kwai;
      default:
        return this.manual;
    }
  }

  isDryRun(): boolean {
    return this.dryRun;
  }
}
