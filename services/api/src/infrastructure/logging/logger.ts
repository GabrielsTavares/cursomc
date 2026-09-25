import pino from "pino";

const SECRET_KEYS = /password|secret|token|authorization|cookie|database_url/i;

export function createLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: [
        "password",
        "req.headers.authorization",
        "req.headers.cookie",
        "DATABASE_URL",
        "JWT_SECRET",
        "SEED_USER_PASSWORD",
      ],
      censor: "[Redacted]",
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    formatters: {
      log(object) {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(object)) {
          out[key] = SECRET_KEYS.test(key) ? "[Redacted]" : value;
        }
        return out;
      },
    },
  });
}
