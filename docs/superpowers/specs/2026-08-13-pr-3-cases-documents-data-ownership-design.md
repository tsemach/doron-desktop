# Cases/documents data-ownership decision — design

**Linear issue:** [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend) — "Add user area in the backend"
**Status:** Sub-project 3 of 6 (see [ASC-105 decomposition](#asc-105-decomposition) below)
**Date:** 2026-08-13

## ASC-105 decomposition

1. **Private-area shell & entry point** — PR-1, spec at
   [`2026-08-10-pr-1-private-area-shell-entry-point-design.md`](2026-08-10-pr-1-private-area-shell-entry-point-design.md).
2. **Opening/dashboard page** — PR-2/PR-2.5, depends on #1 only, not on real data.
3. **Cases/documents data-ownership decision** (backend Postgres vs.
   desktop-local vs. hybrid) — this document. The highest-leverage, most
   consequential decision; blocks real (non-mock) workspace features and
   all of sync.
4. **Offline + two-way sync** — cannot be designed until #3 is decided.
5. **Shared UI strategy** (`packages/ui` expansion) — can start early in
   parallel, but concrete data-bound components need #3 resolved.
6. **"Coming soon" gating for unbuilt features** — small, mechanical,
   depends on #1.

This document covers **#3 only**: a decision and its rationale, not
implementation. #4 and #5 each get their own spec once this lands.

## Background

The ASC-105 issue itself asks this as an open question, verbatim: *"how to
handle documents - where is the source of truth? are they in cloud or
locally? how to handle two way syncing."* Two pieces of groundwork already
exist and directly shape the answer:

- **Desktop data model is 100% local, with zero tenancy.** Every
  case/document table (`cases`, `case_fields`, `case_annotations`,
  `document_annotations`, `tags`, `case_emails`, `pending_email_alerts`,
  `documents`, `document_chunks`, `doc_templates`, `case_templates`,
  `document_versions`, plus the matcher's `case_identifiers`/`case_text_fts`)
  lives in a per-install SQLite database
  (`apps/desktop/src-tauri/src/store/mod.rs`,
  `apps/desktop/src-tauri/src/store/matcher_schema.rs`). **None of them has
  a `user_id`, `owner_id`, or `firm_id` column.** Timestamp coverage is
  inconsistent — several tables (`case_fields`, `document_chunks`,
  `case_template_docs`) have no timestamp column at all — and no table has
  a version/revision counter. A repo-wide search for
  `dirty_flag|remote_id|conflict_resolution|is_dirty|sync_status` returns
  zero hits: no sync-prep concept exists anywhere in the codebase today.
- **Backend identity/org layer is real, and case/document data isn't.**
  ASC-142 (merged) added `firms`, `users` (`role`: admin/manager/user/flat,
  `firmId`), `teams`, `teamMembers`, `invitations` to
  `packages/backend-orm/src/schema.ts`. There is no table anywhere in the
  backend resembling cases, documents, matters, or client records. ASC-142's
  own design doc (`docs/identity-and-roles/design.md`) explicitly scoped
  "cross-user visibility into case/document content" as a non-goal,
  deferring it to exactly this decision.
- **The stated architectural constraint.** `PRD.md` §6 calls "local-first /
  privacy" *"a stated architectural value, not just a cost optimization —
  client confidentiality is presumably a real constraint for the target
  user,"* and adds: *"Any auth/subscription bridge to the backend must not
  silently start uploading case content."* The same section states offline
  tolerance as a hard requirement: the app works fully offline today, and a
  lawyer "standing in a courthouse basement with dead WiFi is a real
  scenario for this product." `PRD.md` §8.3 separately flags multi-user/firm
  sharing of case content as an unresolved open question.
- **The tension this decision has to resolve.** ASC-105's own stated goal
  is to shift "the usual case is a firm with several users with several
  roles... this change the whole design into more and more SaaS
  application" (ASC-105 issue body) — most business logic moving into
  `apps/backend`. The dashboard already built for that goal (PR-2/PR-2.5)
  renders `Important Tasks`, `Emails Arrived`, `Billing & Finance`, and
  `Open Cases` panels in `apps/backend` today — 100% mock data, because
  there is nothing real in Postgres to back it. Fixing that, without
  breaking the stated privacy/offline constraints above, is what this
  decision has to thread.

## Goals

- Give a definitive answer to "where does case/document data live," so #4
  (offline + two-way sync) has a concrete target to design against instead
  of an open question.
- Keep the existing local-first/privacy guarantee intact for anything a
  client would reasonably expect to stay confidential (document contents,
  email bodies, extracted text/embeddings).
- Unblock the dashboard (#2) and any future firm-wide case visibility
  (which ASC-142's team/role model was built to support) from being
  permanently mock.

## Non-goals (explicitly deferred)

- Any schema migration, Postgres table creation, or Drizzle changes — that
  belongs to whichever PR implements #4.
- Any desktop Rust changes (sync client, dirty-flag tracking, push logic).
- The actual bidirectional sync/conflict-resolution mechanism — #4.
- A final, binding schema for the "case summary" concept sketched below —
  it's illustrative, to make the decision concrete, not a spec to build
  against verbatim.

## Decision

**Hybrid: full case/document content stays desktop-local. A thin, explicit
"case summary" layer is pushed from desktop to backend Postgres.**

Three options were weighed:

### Option A — Backend Postgres becomes the source of truth

Documents move to object storage, metadata moves to Postgres, and the
desktop app becomes an offline-capable client syncing against the backend.

- Enables full multi-device access and real team collaboration on case
  content — the most complete realization of the SaaS vision.
- Directly conflicts with *"must not silently start uploading case
  content"* — this is exactly that, by construction.
- Requires the full two-way offline-sync design (#4) to already exist and
  be trustworthy *before* it's safe to ship, since a lawyer's only copy of
  their case files can never be silently lost to a sync bug.
- Largest blast radius: touches nearly every desktop Rust module in
  `case/`, `documents/`, `extractor/`, `embeddings/`.

### Option B — Stay 100% desktop-local, permanently

No case/document data ever reaches the backend. The dashboard (and any
future firm-wide visibility) stays mock forever, or gets cut from scope.

- Zero migration risk, fully preserves the privacy guarantee as-is.
- Permanently strands ASC-105's own stated direction — the SaaS "user area"
  becomes UI-only shell around no real workspace data, and ASC-142's
  team/role investment goes largely unused for the thing users actually do
  (casework).

### Option C — Hybrid (recommended)

Anything a client would reasonably expect to stay confidential — document
contents, email bodies, extracted text, embeddings, raw metadata — never
leaves the desktop. A new, narrow **case summary** concept is explicitly and
visibly pushed from desktop to backend: case name/subject/status, task
titles + due dates, email subjects + arrival counts, billing amounts —
exactly the shape the dashboard's existing mock data already assumes
(`apps/backend/lib/dashboard/types.ts`'s `ImportantTask`, `EmailArrival`,
`BillingSummary`, `CaseSummary` types).

- Satisfies the "must not silently start uploading" constraint: it's a
  distinct, visible, deliberately narrow sync, not bulk content upload —
  the kind of thing that can be a clear opt-in setting per firm/user.
- Gives the dashboard, and any future firm-wide case list, real data.
- Only requires a **push-only** sync at first (desktop → backend), which
  sidesteps the hard bidirectional conflict-resolution problem entirely for
  v1 — #4 gets a much more tractable starting scope than Option A would
  hand it.
- Two sources of truth exist for the summary fields specifically (local is
  authoritative; backend is a downstream copy) — a real but bounded
  complexity, confined to a handful of fields rather than the whole data
  model.

### Illustrative shape (not a schema to build against)

A `case_summaries`-style Postgres table, to make the decision concrete:

```
case_summaries
  id              uuid PK
  local_case_id   text        -- desktop's own cases.id, opaque to backend
  user_id         -> users.id
  subject         text
  status          text
  updated_at      timestamptz -- last successful push
  -- plus small denormalized rollups (open task count, next due date,
  -- unread email count, outstanding/collected amounts) rather than
  -- normalized child tables, since backend never needs to query into
  -- individual tasks/emails/invoices -- only display what the desktop
  -- already computed
```

## Edge cases

- **No summary pushed yet** (new user, sync never run, or a user who opts
  out) — dashboard falls back to its current empty/mock-free state, not an
  error. This is the same shape as today's mock data being absent for a
  freshly signed-up account.
- **Multiple desktop installs for one user** — last-write-wins on
  `updated_at` is sufficient for a *summary* (unlike full case content,
  where last-write-wins would be a real data-loss risk); this is exactly
  why summaries are push-only and content stays local.
- **A firm member viewing another member's cases** (future, once #5/team
  visibility is wired up) — summaries carry `user_id`, so scoping to
  "cases visible to me" is a permissions question for that future work, not
  this decision.

## What this unblocks

- **#4 (offline + two-way sync)** gets a concrete, bounded starting scope:
  design the push-summary sync mechanism and endpoint first (one-directional,
  small field set), rather than the full bidirectional problem for all case
  content.
- **#5 (shared UI strategy)** can design data-bound components against the
  case-summary shape sketched above.
- **#2's dashboard** becomes wireable to real data once #4 ships the actual
  push mechanism — no changes needed to the dashboard's existing component
  shape (`ImportantTasksCard`, `EmailsArrivedCard`, `BillingFinanceCard`,
  `OpenCasesPanel`), since it was already built against types matching this
  summary shape.
