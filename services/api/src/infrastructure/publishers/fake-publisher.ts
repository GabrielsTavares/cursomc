import type { PublishCommand, PublishResult, SocialPublisher } from "../../application/ports.js";

/**
 * Dev / PUBLISH_MODE=dry_run: never calls external APIs; simulates success.
 */
export class FakePublisher implements SocialPublisher {
  async publish(command: PublishCommand): Promise<PublishResult> {
    return {
      status: "PUBLISHED",
      externalPostId: `dry_run_${command.platform.toLowerCase()}_${command.publicationId.slice(0, 8)}`,
      errorMessage: null,
      checklist: undefined,
    };
  }
}
