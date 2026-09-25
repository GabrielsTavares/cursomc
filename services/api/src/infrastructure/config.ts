import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.string().default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("creator_hub_session"),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  SEED_USER_EMAIL: z.string().email().default("admin@creator.local"),
  SEED_USER_PASSWORD: z.string().min(8).default("changeme123"),
  SEED_USER_DISPLAY_NAME: z.string().default("Gabriel"),
  MEDIA_ROOT: z.string().default("/data/media"),
  /** Max image upload size in bytes (jpg/png/webp). Default 15 MiB. */
  MEDIA_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  /** Max video upload size in bytes (mp4/webm). Default 200 MiB. */
  MEDIA_MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  /**
   * AES key material for social credential vault (MVP).
   * Min 32 chars. Not a full KMS — see README limitations.
   */
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("local-dev-only-change-me-credentials-key!!"),

  /**
   * live = call network APIs; dry_run = FakePublisher (simula sucesso sem rede).
   * Default dry_run until app review / tokens are ready.
   */
  PUBLISH_MODE: z.enum(["live", "dry_run"]).default("dry_run"),
  /** Scheduler tick interval in seconds (node-cron every N seconds). */
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
  /** Max publications claimed per tick. */
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  SCHEDULER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== "false"),

  /** TikTok Developer app (fallback if not stored on SocialAccount). */
  TIKTOK_CLIENT_KEY: z.string().optional().default(""),
  TIKTOK_CLIENT_SECRET: z.string().optional().default(""),
  /**
   * inbox = Content Posting inbox/draft (scope video.upload) — user finishes in TikTok.
   * direct = Direct Post (scope video.publish) — requires app review + privacy consent.
   */
  TIKTOK_POST_MODE: z.enum(["inbox", "direct"]).default("inbox"),

  /** Meta / Instagram Graph app (fallback). */
  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_GRAPH_VERSION: z.string().default("v21.0"),
  /**
   * Public HTTPS base for media when using IG video_url (optional).
   * Local storage has no public URL — Instagram live uses resumable upload instead.
   */
  PUBLISH_PUBLIC_BASE_URL: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }
  return parsed.data;
}
