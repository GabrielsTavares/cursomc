import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  const migrationsFolder = path.resolve(__dirname, "../../../drizzle");
  await migrate(db, { migrationsFolder });
  await pool.end();
  // eslint-disable-next-line no-console
  console.log("Migrations applied.");
}

main().catch((err) => {
  // Avoid logging env/secrets; message only
  console.error("Migration failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
