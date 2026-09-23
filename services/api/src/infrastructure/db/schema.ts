import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentProjects = pgTable("content_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  projectType: varchar("project_type", { length: 40 }).notNull().default("CREATOR"),
  enabledModules: jsonb("enabled_modules").$type<string[]>().notNull().default([]),
  localeDefault: varchar("locale_default", { length: 16 }).notNull().default("pt-BR"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => contentProjects.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 40 }).notNull(),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("NEEDS_CREDENTIALS"),
  externalAccountId: varchar("external_account_id", { length: 320 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** AES-GCM ciphertext of SocialCredentialSecrets JSON — never expose via API. */
export const socialAccountSecrets = pgTable("social_account_secrets", {
  socialAccountId: uuid("social_account_id")
    .primaryKey()
    .references(() => socialAccounts.id, { onDelete: "cascade" }),
  encryptedPayload: text("encrypted_payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type ContentProjectRow = typeof contentProjects.$inferSelect;
export type SocialAccountRow = typeof socialAccounts.$inferSelect;
