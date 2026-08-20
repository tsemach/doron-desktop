import { pgTable, text, integer, timestamp, primaryKey, uuid, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ASC-142 -- a firm is created only when its first admin is invited from
// apps/office (see invitations.role below); firms are fully isolated from
// each other (no cross-firm queries anywhere in the app).
export const firms = pgTable("firms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Unique -- apps/office's "Create a firm" form has no other way to tell
  // two firms apart, so two rows named identically would be indistinguishable
  // (and a real bug: found by creating "Doron and sons" twice in testing).
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"), // Nullable for social-only accounts
  tier: text("tier", { enum: ["free", "pro"] }).default("free").notNull(),
  // Null until the user has actually chosen Free or Pro (select-plan / the
  // payments webhook). `tier` alone can't distinguish "explicitly chose
  // Free" from "never chosen anything" since it defaults to 'free' -- this
  // is what the OAuth callback pages check to decide whether to route a
  // fresh sign-in to /register/plan or straight into the app.
  planSelectedAt: timestamp("plan_selected_at", { mode: "date" }),
  // ASC-142 -- account role. Self-registered accounts (app/api/v1/auth/signup)
  // default to "flat": full access, no firm, peers with other flat users via
  // flatGroupMembers below. "admin" is never self-assignable -- it's only
  // ever set by accepting an office-issued invitation (see invitations.role).
  role: text("role", { enum: ["admin", "manager", "user", "flat"] }).default("flat").notNull(),
  // Null for flat users. Set from the accepted invitation for admin/manager/user.
  firmId: text("firm_id").references(() => firms.id, { onDelete: "cascade" }),
  // ASC-157 -- interface language, same "en"/"he" values as the desktop
  // app's LanguageContext. DB-backed (not just localStorage/cookie) so the
  // preference follows the user across devices.
  locale: text("locale", { enum: ["en", "he"] }).default("en").notNull(),
  // ASC-157 -- interface font id, same option set as desktop's FontContext
  // (apps/desktop/src/context/FontContext.tsx AppFont).
  interfaceFont: text("interface_font", {
    enum: ["plex", "assistant", "noto", "frank", "rubik", "heebo"],
  })
    .default("plex")
    .notNull(),
  // Soft delete only (ASC-142 rule 12) -- every lookup used for
  // authentication (verifyCredentials, desktop-session, authorizeOrgRequest)
  // must filter this out; nothing here hard-deletes a user row.
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
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

// Opaque bearer tokens for the desktop app, separate from NextAuth's web
// session cookie since the desktop client can't hold browser cookies across
// restarts. Stored (not signed-JWT) so a token is revocable by deleting the
// row, mirroring the existing `sessions` table's shape/intent above.
export const desktopSessions = pgTable("desktop_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ASC-142 -- a group of users with one manager. managerId is not unique, so
// a manager can own several teams (rule 4). Membership is a separate join
// table (teamMembers) rather than a teamId column on users, because a team
// member can itself be a manager who owns their own team(s) -- "a team of
// managers" (rule 6) -- which a single FK on users can't represent.
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  managerId: text("manager_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  // Hex string (e.g. "#3b82f6") picked from a fixed swatch palette in the
  // create-team UI -- plain text, not a pgEnum, matching this file's
  // existing convention for constrained-but-not-DB-enforced values.
  color: text("color"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// A user's manager is derived by walking teamMembers -> teams.managerId
// (deliberately no users.managerId column -- see teams' comment above).
export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })]
);

// ASC-142 email-invitation onboarding. A dedicated table rather than
// reusing verificationTokens -- an invitation carries a role/firm/team
// payload that an identifier+token+expires row can't hold. role="admin"
// rows may only ever be created by apps/office's invite-admin route (rule
// 2); the firm-facing invite API (admins/managers) must never produce one.
// role="flat" invitations carry no firmId/teamId -- acceptance instead adds
// both parties to a flatGroups row (rule 13).
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "manager", "user", "flat"] }).notNull(),
  // Nullable only for the office's admin invite, issued before the firms
  // row exists in the same transaction; every other role sets it.
  firmId: text("firm_id").references(() => firms.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  invitedByUserId: text("invited_by_user_id").references(() => users.id),
  token: text("token").unique().notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  // Set (not row-deleted) on acceptance, unlike consumeEmailVerification --
  // keeps an audit trail of who accepted what, when.
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ASC-142 rule 13 -- flat users have no firm, but can form a peer group
// with other flat users via a role="flat" invitation. A flat user belongs
// to at most one group (userId unique).
export const flatGroups = pgTable("flat_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const flatGroupMembers = pgTable(
  "flat_group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => flatGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] })]
);

export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  language: text("language").notNull(), // 'en' or 'he'
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-tier monthly AI budget, backing the online-AI quota check in
// lib/ai/usage.ts. A DB table (not a code constant) deliberately -- the
// budget must be adjustable without a redeploy. No row for 'free': the
// usage service treats a missing plan as "not entitled to cloud AI", not a
// $0 budget (see docs/ai-online-proxy).
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  tier: text("tier", { enum: ["free", "pro"] }).unique().notNull(),
  monthlyBudgetCents: integer("monthly_budget_cents").notNull(),
  gatewayRateLimitTier: text("gateway_rate_limit_tier"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Running per-user, per-billing-period spend against a plan's budget --
// the fast pre-request quota check. Kept as a rollup separate from the
// ai_requests detail log below so the hot-path check never needs to SUM()
// across every request. billingPeriod is a UTC calendar month ("2026-07"),
// not a subscription-anniversary period -- there's no real billing engine
// yet, so this is a deliberate simplification.
export const aiUsagePeriods = pgTable(
  "ai_usage_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billingPeriod: text("billing_period").notNull(),
    costCents: integer("cost_cents").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("ai_usage_periods_user_period_idx").on(t.userId, t.billingPeriod)]
);

// One row per backend-proxied AI call (the /api/v1/ai/complete route) --
// prompt, response, cost, and outcome, for support/billing observability
// beyond what the AI Gateway dashboard provides. conversationId groups
// multi-turn exchanges for a future interactive surface; today's
// single-shot callers (indexing, classification, extraction) leave it
// null. Retention/redaction policy for prompt/response is intentionally
// not implemented here -- see docs/ai-online-proxy/ai_online_proxy_architecture.md §9.
export const aiRequests = pgTable("ai_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id"),
  purpose: text("purpose", {
    enum: ["chat", "email_classification", "field_extraction", "doc_indexing", "query_analysis", "voice_transcription"],
  }).notNull(),
  model: text("model").notNull(),
  // jsonb, not text -- today this holds a single string, but a future
  // multi-turn/tool-calling surface needs it to hold a full turn array
  // (e.g. AI SDK's ModelMessage[] shape: role + text/tool-call/tool-result
  // blocks), which text can't represent. jsonb stores either shape as-is,
  // with no migration needed when that day comes.
  prompt: jsonb("prompt"),
  response: jsonb("response"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costCents: integer("cost_cents"),
  finishReason: text("finish_reason"),
  errorCode: text("error_code", {
    enum: ["rate_limited", "quota_exceeded", "provider_error"],
  }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ASC-172 -- contact records for a case. Ownership/visibility rule (see
// docs/contact/design.md §5): flat users share one global pool
// (accountType='flat'); firm users' contacts are private to userId by
// default, shared via contactShares below. accountType is denormalized
// from users.role at write time solely so the two partial unique indexes
// below can enforce email dedupe without a join.
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountType: text("account_type", { enum: ["flat", "firm"] }).notNull(),
    name: text("name"),
    email: text("email").notNull(),
    emailNorm: text("email_norm").notNull(),
    phone: text("phone"),
    organization: text("organization"),
    source: text("source", { enum: ["manual", "email", "case_creation", "google"] }).notNull(),
    googleContactId: text("google_contact_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    // Attribution for edits -- editing is not owner-only (design.md §5), so
    // this records whoever made the most recent change, owner or share recipient.
    updatedByUserId: text("updated_by_user_id").references(() => users.id),
  },
  (t) => [
    // Flat users share one global pool: an email can exist only once
    // across ALL flat contacts.
    uniqueIndex("contacts_email_flat_uniq")
      .on(t.emailNorm)
      .where(sql`account_type = 'flat'`),
    // Firm users each have a private list: an email can exist once per
    // owning user.
    uniqueIndex("contacts_email_firm_uniq")
      .on(t.userId, t.emailNorm)
      .where(sql`account_type = 'firm'`),
  ]
);

// Sharing is a reference, not a copy: a row here grants sharedWithUserId
// read/edit/link access to contactId without duplicating any of its fields.
// Editing the contact is instantly visible to everyone it's shared with;
// deleting this row (or the contact) revokes access immediately.
export const contactShares = pgTable(
  "contact_shares",
  {
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    sharedWithUserId: text("shared_with_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sharedByUserId: text("shared_by_user_id").notNull().references(() => users.id),
    sharedAt: timestamp("shared_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.sharedWithUserId] })]
);

