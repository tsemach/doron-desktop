import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Amicus staff/ops accounts for the back office -- deliberately a separate
// table from apps/backend's `users` (Amicus customers). No OAuth, no tier,
// no email-verification flow: admin accounts are provisioned directly
// (see scripts/seed-admin.mjs), not self-registered.
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});
