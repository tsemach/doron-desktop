import { pgTable, text, integer, real, timestamp, primaryKey, uuid, uniqueIndex, check, jsonb, vector } from "drizzle-orm/pg-core";
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

// ASC-181 (Phase 1 of ASC-179) -- an independently-populated SaaS case
// data model, not a mirror/sync of desktop's local SQLite (see
// docs/backend-saas/masterplan/plan.md, Core Decision 1, and
// docs/backend-saas/phase-1-data-foundation/design.md for the full
// ownership/visibility rationale). No firmId column here deliberately --
// firm membership is derived fresh via join to users at query time, same
// anti-staleness convention contacts uses above.
export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject"),
  // Loose text, no CHECK -- deliberately mirrors desktop's cases.status
  // column (store/mod.rs), which also has no CHECK constraint.
  status: text("status").default("open").notNull(),
  // Soft delete, matching users.deletedAt's convention above.
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Firm-owned (or personal for flat users) -- unlike cases above, not
// derived from a user relationship, so a template survives a user leaving
// the firm rather than disappearing with them. Exactly one of firmId/
// userId is set, DB-enforced (Phase 7's hardening checklist named this
// requirement explicitly -- not left as an app-layer-only invariant).
export const caseTemplates = pgTable(
  "case_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: text("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    fields: jsonb("fields"), // mirrors desktop's case_templates.fields JSON column
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "case_templates_firm_xor_user",
      sql`(${t.firmId} is not null and ${t.userId} is null) or (${t.firmId} is null and ${t.userId} is not null)`
    ),
  ]
);

// Desktop's doc_templates concept (placeholder-fillable document templates
// used when generating a case's documents) -- named caseDocTemplates, NOT
// docTemplates, to avoid colliding with the pre-existing documentTemplates
// table above, which is an unrelated, already-in-flight office migration
// (see CLAUDE.md) and must not be reused or extended here. Same firm-xor-
// user ownership shape as caseTemplates above.
export const caseDocTemplates = pgTable(
  "case_doc_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: text("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    fileName: text("file_name").notNull(),
    title: text("title").notNull(),
    fieldsFound: jsonb("fields_found"), // mirrors desktop's doc_templates.fields_found
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "case_doc_templates_firm_xor_user",
      sql`(${t.firmId} is not null and ${t.userId} is null) or (${t.firmId} is null and ${t.userId} is not null)`
    ),
  ]
);

// Same firm-xor-user ownership shape as caseTemplates/caseDocTemplates above.
export const taskTemplates = pgTable(
  "task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: text("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "task_templates_firm_xor_user",
      sql`(${t.firmId} is not null and ${t.userId} is null) or (${t.firmId} is null and ${t.userId} is not null)`
    ),
  ]
);

// Owned child of taskTemplates, not independently shared -- visibility
// inherits from the parent template, matching desktop's task_template_items
// (a child of task_templates via task_template_id, store/mod.rs).
export const taskTemplateItems = pgTable("task_template_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskTemplateId: uuid("task_template_id")
    .notNull()
    .references(() => taskTemplates.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  estimateValue: real("estimate_value").notNull(),
  estimateUnit: text("estimate_unit", { enum: ["day", "hour"] }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
});

// Join table, mirrors desktop's case_template_docs (store/mod.rs).
export const caseTemplateDocs = pgTable(
  "case_template_docs",
  {
    caseTemplateId: uuid("case_template_id")
      .notNull()
      .references(() => caseTemplates.id, { onDelete: "cascade" }),
    caseDocTemplateId: uuid("case_doc_template_id")
      .notNull()
      .references(() => caseDocTemplates.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.caseTemplateId, t.caseDocTemplateId] })]
);

// Tasks/documents/case-linked meetings inherit visibility transitively
// through their parent case's userId -- no independent ownership column on
// this table (see docs/backend-saas/phase-1-data-foundation/design.md).
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["Waiting", "In progress", "Cancel", "Done"] })
    .default("Waiting")
    .notNull(),
  // Nullable together at the app layer -- an ad-hoc task may have no estimate.
  estimateValue: real("estimate_value"),
  estimateUnit: text("estimate_unit", { enum: ["day", "hour"] }),
  dueDate: timestamp("due_date", { mode: "date" }),
  taskTemplateItemId: uuid("task_template_item_id").references(() => taskTemplateItems.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Phase 5's search-index target -- minimal for now; Phase 5 adds a
// documentChunks table FK'd to this one. relativePath (not an absolute
// path) per docs/backend-saas/phase-4-local-documents/design.md -- the
// File System Access API never exposes an absolute path, by spec.
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }), // mandatory -- deliberate deviation from desktop, which has no case_id on documents at all
  fileName: text("file_name").notNull(),
  relativePath: text("relative_path").notNull(),
  addedByUserId: text("added_by_user_id")
    .notNull()
    .references(() => users.id), // provenance only, not used for visibility
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ASC-185 (Phase 5) -- extracted text/embedding chunks, FK'd to documents.
// No userId/firmId here -- visibility is transitive through documents ->
// cases -> cases.userId, same pattern as every other case-rooted table.
// Dimension 1536 matches OpenAI's text-embedding-3-small (a chosen
// default, not a hard requirement -- revisit if the implementation
// settles on a different Gateway embedding model). Requires the pgvector
// extension enabled on the Postgres instance (see
// docs/backend-saas/phase-5-search-indexing/design.md's open risks --
// not assumed already on).
export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Personal OAuth grant -- one connected account per user, never shared
// even with a manager (see docs/backend-saas/phase-3-core-pages/design.md).
export const googleCalendarAccounts = pgTable("google_calendar_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { mode: "date" }).notNull(),
  syncToken: text("sync_token"),
  connectedAt: timestamp("connected_at", { mode: "date" }).defaultNow().notNull(),
});

// Not-case-linked meetings anchor visibility to userId directly (the
// connecting account's owner); case-linked ones inherit transitively via
// caseId -> cases.userId, same as tasks/documents above.
export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleEventId: text("google_event_id").unique().notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: timestamp("start_time", { mode: "date" }).notNull(),
  endTime: timestamp("end_time", { mode: "date" }).notNull(),
  status: text("status", { enum: ["confirmed", "tentative", "cancelled"] })
    .default("confirmed")
    .notNull(),
  caseLinkSource: text("case_link_source", { enum: ["none", "phrase_match", "manual"] })
    .default("none")
    .notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

