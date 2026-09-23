import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";
import { users, workspaces } from "./schema.js";

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, config.SEED_USER_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log("Seed user already exists; skipping.");
    await pool.end();
    return;
  }

  const passwordHash = await argon2.hash(config.SEED_USER_PASSWORD);
  const [user] = await db
    .insert(users)
    .values({
      email: config.SEED_USER_EMAIL,
      passwordHash,
      displayName: config.SEED_USER_DISPLAY_NAME,
    })
    .returning();

  if (!user) {
    throw new Error("Failed to insert seed user");
  }

  await db.insert(workspaces).values({
    name: "Personal",
    ownerUserId: user.id,
  });

  console.log(`Seeded user ${config.SEED_USER_EMAIL}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
