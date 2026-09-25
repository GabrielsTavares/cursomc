import type { FastifyBaseLogger } from "fastify";
import type { PublishDuePublicationsUseCase } from "../../application/publishing-use-cases.js";

export interface PublicationSchedulerOptions {
  intervalSeconds: number;
  enabled: boolean;
  logger: FastifyBaseLogger;
}

/**
 * In-process scheduler (ADR-001): ticks every N seconds and claims due publications.
 * Uses setInterval (node-cron-compatible cadence) so we avoid extra dep if unused.
 */
export class PublicationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly useCase: PublishDuePublicationsUseCase,
    private readonly options: PublicationSchedulerOptions,
  ) {}

  start(): void {
    if (!this.options.enabled) {
      this.options.logger.info("Publication scheduler disabled (SCHEDULER_ENABLED=false)");
      return;
    }
    if (this.timer) return;
    const ms = Math.max(1, this.options.intervalSeconds) * 1000;
    this.options.logger.info(
      { intervalSeconds: this.options.intervalSeconds },
      "Publication scheduler started",
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, ms);
    // Avoid keeping process alive solely for timer in tests if unref available
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.useCase.execute();
      if (result.claimed > 0) {
        this.options.logger.info(result, "Scheduler processed due publications");
      }
    } catch (err) {
      this.options.logger.error(
        { err: err instanceof Error ? err.message : "unknown" },
        "Scheduler tick failed",
      );
    } finally {
      this.running = false;
    }
  }
}
