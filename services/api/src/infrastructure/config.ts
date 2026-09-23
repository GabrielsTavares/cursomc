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
  /**
   * AES key material for social credential vault (MVP).
   * Min 32 chars. Not a full KMS — see README limitations.
   */
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("local-dev-only-change-me-credentials-key!!"),
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
