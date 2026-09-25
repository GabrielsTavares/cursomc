import { loadConfig } from "./infrastructure/config.js";
import { createApp } from "./http/create-app.js";

async function main() {
  const config = loadConfig();
  const { app, pool } = await createApp(config);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  app.log.info({ port: config.API_PORT }, "API listening");
}

main().catch((err) => {
  console.error("Fatal startup error:", err instanceof Error ? err.message : "unknown");
  process.exit(1);
});
