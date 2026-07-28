import { pgTable, text, integer, timestamp, primaryKey, uuid, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

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

