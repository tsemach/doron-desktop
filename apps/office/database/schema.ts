import { pgTable, text, integer, timestamp, primaryKey, uuid } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Amicus staff/ops accounts for the back office -- deliberately a separate
// table from apps/backend's `users` (Amicus customers). Credentials accounts
// are provisioned directly (see scripts/seed-admin.mjs), not self-registered.
// OAuth (Google/Facebook) sign-in is also allowed, but gated in auth.ts's
// signIn callback to only emails that already have a row here -- unlike
// apps/backend, OAuth here must never be able to create a new admin.
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique().notNull(),
  // emailVerified/image: required by @auth/drizzle-adapter's DefaultPostgresUsersTable
  // shape (it's built for NextAuth's standard AdapterUser), not meaningfully
  // used for admins -- image ends up holding the OAuth avatar if present.
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Nullable: OAuth-only admins (no credentials login) never get one.
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Prefixed (admin_accounts/admin_sessions/admin_verification_tokens) rather
// than the adapter's usual accounts/sessions/verification_tokens -- this
// app has its own dedicated database ("ascurix-office", separate from
// apps/backend's), so there's no naming collision risk, but the prefix is
// kept for clarity if the two are ever inspected side by side.
export const accounts = pgTable(
  "admin_accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    {
      parentKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    },
  ]
);

export const sessions = pgTable("admin_sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "admin_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [
    {
      parentKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    },
  ]
);

// Copied from apps/backend/database/schema.ts (not shared -- apps/backend's
// copy of this table/feature will be deleted once this one fully replaces
// it, but not yet), so this is its own independent registry, not the same
// rows as apps/backend's `document_templates`.
export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  language: text("language").notNull(), // 'en' or 'he'
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
