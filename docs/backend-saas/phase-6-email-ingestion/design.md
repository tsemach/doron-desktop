# Phase 6: Email ingestion & classification — design

**Linear issue:** [ASC-186](https://linear.app/amicusx/issue/ASC-186) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
**Status:** Design — not yet implemented.
**Date:** 2026-08-22

Covers **Phase 6 only**, per
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) (PR-6,
stacked on PR-5).

## Goals

- Server-side email ingestion and case-matching, tenant-scoped per Phase
  1's schema, giving the backend feature parity with desktop's `email/`
  module without porting its implementation wholesale.
- Adapt desktop's *always-on* polling model to a serverless execution
  environment correctly, not by assumption.

## Non-goals

- Generic IMAP username/password connections — explicitly deferred (see
  Decision below), not silently dropped.
- Desktop's full fuzzy case-matching pipeline (`case_matcher/`,
  `match_email_core`) — v1 mirrors Calendar's simpler near-exact matching
  approach instead (see Decision below); the fuller pipeline is a
  fast-follow.
- Actual code — decision doc only, matching the rest of this stack.

## Decision: OAuth-only providers for v1, not generic IMAP+password

Desktop's `email_configurations` table stores generic IMAP host/port/
username/password — appropriate for a local app under one user's control.
A multi-tenant backend storing raw mailbox passwords for many users is a
materially different, larger security surface (same category of concern
flagged when cloud-storage-provider APIs were rejected earlier in this
plan, though smaller in scope here). Gmail and Microsoft 365 — the
realistic majority of this product's users — both support OAuth2. Calendar
(`docs/calendar/design.md`) already established OAuth as this codebase's
pattern for exactly this kind of third-party account connection.

**Decision: v1 supports Google and Microsoft OAuth only** (one connected
inbox per user, mirroring Calendar's own "single calendar account" scope
decision — not a new restriction invented for this phase). Generic
IMAP+password is a named, deliberate fast-follow, not an oversight — see
Open risks.

## Decision: use each provider's REST mail API, not raw IMAP

A consequence of the OAuth-only decision, not a separate choice: once
scoped to Google/Microsoft, their REST mail APIs (Gmail API
`users.messages.list`, Microsoft Graph `/me/messages`) are strictly better
fits than raw IMAP — structured JSON, delta/history-based incremental
fetch, no MIME-parsing burden, and no need for a Node IMAP client library
at all. This refines the master plan's literal "IMAP polling" wording into
"provider REST API polling" — a more precise implementation of the same
intent, not a scope change (desktop's IMAP choice was about generic
protocol compatibility for a local app, a concern that doesn't apply once
v1 is scoped to two OAuth providers).

## Decision: Vercel Cron replaces desktop's persistent polling loop

Desktop's `poll_emails_background` is a `tokio::time::interval` loop
running for the lifetime of the app process. **This has no direct
equivalent on Vercel** — serverless functions are request-driven, not
long-lived background processes; porting the loop as-is would not run at
all. The correct adaptation is a **Vercel Cron Job** (`vercel.ts`'s
`crons: [{ path: "/api/v1/email/poll", schedule: "*/5 * * * *" }]`)
invoking a route that does one poll pass across every connected account
(refreshing OAuth tokens as needed, mirroring Calendar's
`get_valid_access_token` pattern server-side), not a self-contained loop.
**Cron schedule granularity depends on the Vercel plan** (finer-than-daily
schedules aren't available on every tier) — verify the actual plan this
project deploys under before the implementation PR commits to a specific
interval; not assumed here.

## Decision: reuse the AI Gateway pattern for classification

Same reasoning as Phase 5: `apps/backend/lib/ai/purpose.ts`'s enum already
reserves `"email_classification"`, unused until now. Classification calls
go through the same `authorizeRequest` → quota → Gateway → `recordUsage`/
`recordAiRequest` pattern `/api/v1/ai/complete` already implements, with
`purpose: "email_classification"` — no new provider plumbing, consistent
with Phase 5's `/embed` route being a sibling of `/complete` rather than
new infrastructure.

## Decision: case-matching mirrors Calendar's approach, not desktop's full pipeline

Desktop's email-to-case matching (`case_matcher/`) is a more elaborate,
confidence-tiered pipeline than Calendar's meeting-to-case linking
(`calendar/case_link.rs`'s near-exact `normalize_for_match` comparison).
For v1 consistency across the backend's newly-built surfaces, email
case-matching mirrors Calendar's simpler near-exact approach rather than
porting desktop's fuller pipeline — same rationale Calendar itself already
used (`docs/calendar/design.md §1` non-goals: "fuzzy/confidence-tiered case
matching... near-exact only"). Desktop's fuller pipeline is a fast-follow
if near-exact proves insufficient in practice.

## Schema additions (extend Phase 1's tables)

```ts
export const emailAccounts = pgTable("email_accounts", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  userId: t.text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }), // one connected inbox per user, mirrors googleCalendarAccounts
  provider: emailProviderEnum("provider").notNull(), // google | microsoft
  emailAddress: t.text("email_address").notNull(),
  accessToken: t.text("access_token").notNull(),
  refreshToken: t.text("refresh_token").notNull(),
  tokenExpiresAt: t.timestamp("token_expires_at").notNull(),
  lastPolledAt: t.timestamp("last_polled_at"),
  connectedAt: t.timestamp("connected_at").defaultNow().notNull(),
}));

// Matched to a case -- transitive visibility through cases, same pattern as tasks/documents.
export const caseEmails = pgTable("case_emails", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  caseId: t.uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  providerMessageId: t.text("provider_message_id").notNull(),
  subject: t.text("subject"),
  fromAddress: t.text("from_address"),
  snippet: t.text("snippet"),
  receivedAt: t.timestamp("received_at").notNull(),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}));

// Not yet matched to a case -- anchored to userId directly, same pattern as non-case-linked meetings.
export const pendingEmailAlerts = pgTable("pending_email_alerts", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  userId: t.text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerMessageId: t.text("provider_message_id").notNull(),
  subject: t.text("subject"),
  fromAddress: t.text("from_address"),
  receivedAt: t.timestamp("received_at").notNull(),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}));
```

`ignoredEmails` (user explicitly dismissed a pending alert) follows the
same `pendingEmailAlerts` shape — omitted here for brevity, implementation-
PR detail.

## What this unblocks

Phase 7's tenant-isolation audit covers `emailAccounts`/`caseEmails`/
`pendingEmailAlerts` alongside everything from Phases 1-5.

## Open risks / follow-ups

- **Generic IMAP+password support**, needed for full desktop feature
  parity (non-Gmail/Outlook providers), is a named fast-follow — requires
  its own security design (encryption-at-rest for stored credentials, at
  minimum) before it should be built, not bundled into v1.
- **Vercel Cron schedule granularity** depends on the deployed plan tier —
  confirm before the implementation PR picks a specific interval.
- Desktop's fuller fuzzy case-matching pipeline, if near-exact matching
  proves insufficient once real usage exists.
