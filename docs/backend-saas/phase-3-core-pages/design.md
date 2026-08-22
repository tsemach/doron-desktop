# Phase 3: Core backend pages — Cases, Tasks, Calendar, Templates — design

**Linear issue:** [ASC-183](https://linear.app/amicusx/issue/ASC-183) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
**Status:** Design — not yet implemented.
**Date:** 2026-08-22

Covers **Phase 3 only**, per
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) (PR-3,
stacked on PR-2). Builds against Phase 1's schema
([design](../phase-1-data-foundation/design.md)) and Phase 2's shared UI
plan ([design](../phase-2-shared-ui/design.md)).

## Goals

- Replace the `ComingSoon` stubs for Cases, Tasks (folded elsewhere — see
  below), and Calendar with real, tenant-scoped CRUD.
- Resolve requirement 3 (drop the top-level "Tasks" nav item) concretely:
  where does task functionality actually live once it's not its own page.
- Establish this repo's **first real business-data UI convention** in
  `apps/backend` — confirmed by research that none exists yet: Contacts
  (ASC-109) shipped a full Postgres-backed CRUD API
  (`apps/backend/app/api/v1/contacts`) but has **no browser page** anywhere
  in `apps/backend` — it's consumed only by desktop's Rust client. `AuthCard`/
  `PasswordInput` (the only existing form pattern) are strictly
  auth/account-flow components per PR-5's scope boundary, not a business-form
  shell. Whatever Phase 3 designs here is genuinely new precedent, not a
  retrofit of something existing.

## Non-goals

- Documents tab / "preview" (Phase 4), Emails tab (Phase 6) — not part of
  the case-detail tab set built here.
- Wiring the existing Contacts feature into the new `cases` table — a real
  future integration (a case's contacts panel), explicitly out of scope for
  this phase; flagged under Open risks.
- Actual code — decision doc only, matching PR-0/PR-1/PR-2's scoping.

## Decision: where task functionality goes without a top-level nav item

Research on `apps/backend/lib/dashboard/mockData.ts` /
`components/app/dashboard/ImportantTasksCard.tsx` found the Home page's
existing (currently mock) `ImportantTasksCard` uses a **thin, denormalized,
read-only** shape (`{ id, title, caseSubject, dueAt, urgency }` —
`caseSubject` is a flattened string, no `status`, no mutation capability).
That confirms it alone cannot be the task surface — it's a glance/launcher,
not a management UI. Desktop's own case-detail tab system
(`CaseDetailTab = "overview" | "preview" | "emails" | "tasks" | "meetings" |
"contacts"`, `CaseManagementOpenCasesDetails.tsx`) treats its "overview" tab
the same way — buttons that just switch to a fuller tab
(`onViewTasks={() => setActiveRightTab("tasks")}`), not a container.

**Decision: two-part, mirroring that exact split.**
1. `ImportantTasksCard` becomes real — queries Phase 1's `tasks` table via
   `listVisibleCases`-equivalent visibility scoping, joined to its case for
   `caseSubject`, top-N by urgency (overdue/due-today/upcoming, same
   bucketing concept as desktop's `taskUrgency.ts`). Still read-only/glance,
   matching its existing shape — no new mutation surface added here.
2. A **Tasks tab inside the case-detail page** (`/app/cases/[id]`), full
   CRUD (create/edit/status-change/delete) scoped to that one case,
   mirroring desktop's `CaseTasksPanel` behind `activeRightTab === "tasks"`.
   This is the actual task-management surface; it just isn't a standalone
   top-level page.

## Decision: case-detail tab set (subset of desktop's 6)

Desktop has 6 tabs; Phase 3 builds **3**: `"overview" | "tasks" |
"meetings"`. `"preview"` (documents) waits for Phase 4, `"emails"` for
Phase 6, `"contacts"` is deferred (Non-goals). Same flat
conditional-switch-on-tab-state shape as desktop
(`CaseManagementOpenCasesDetails.tsx`'s header/content switch), not a tab
component abstraction — no reason to diverge from a pattern that already
works.

## Decision: templates aren't a top-level nav item either

The screenshot's nav has no "Templates" entry, and desktop doesn't put
template management at its top level either — `CasesManagementTemplate`/
`CasesManagementTaskTemplate` are nested *inside* desktop's Case Management
UI, not their own nav destination. Phase 3 mirrors this exactly: template
management (case/task/doc templates, firm-scoped per Phase 1's `firmId`/
`userId` shape) lives nested under `/app/cases` (e.g. a "Manage Templates"
link from the case list), not as new top-level nav.

## Decision: data-fetch pattern

Confirmed convention already in use (`app/app/layout.tsx:34-38`, `app/app/
page.tsx`): **Server Components do Drizzle queries directly inline** for
page-load reads — Cases/Tasks/Calendar list and detail pages follow this
for their initial render. For mutations and client-side interactivity
(create/edit/delete, tab switching within a case), a client component calls
a new cookie-authenticated route under `apps/backend/app/api/v1/cases/*`
(etc.), mirroring `app/api/v1/org/members/route.ts`'s shape exactly:
`authorizeOrgSession()` → business-logic function (a `listVisibleCases`-
style function per resource, per Phase 1's design) → `NextResponse.json(...)`.

## Decision: case status values

Phase 1's `cases.status` column is loose `text`, default `'open'`, no
`CHECK` (deliberately mirroring desktop's own lack of one). The existing
mock dashboard's `CaseStatus` type is `"open" | "waiting" | "closed"`
(`lib/dashboard/types.ts:1`) — Phase 3 adopts this 3-value set as the
**application-layer working set** (what the UI writes and filters on), with
no DB-level constraint change — consistent with the schema decision already
made in Phase 1, not a re-opening of it.

## Decision: Google Calendar connection is backend-native, not desktop's flow

Desktop's OAuth (`docs/calendar/design.md §4`) uses a loopback-listener
trick specifically because a desktop app has no public callback URL.
Backend has a real public domain, so the standard OAuth authorization-code
redirect flow applies directly — simpler than desktop's approach, not a
port of it. New routes under `apps/backend/app/api/v1/calendar/google/
{connect,callback}`, storing tokens in Phase 1's `googleCalendarAccounts`
table (per-user, never shared). Full sync-engine/reminder design (mirroring
desktop's polling shape) is implementation-PR detail, not re-specified here
— the schema and connection-flow shape are what this phase commits to.

## Form/modal pattern

No existing convention to extend (confirmed above). Create Case / Create
Task / Create Meeting forms are new, composed from Phase 2's canonical
Button plus whichever of `packages/ui`'s deferred primitives
(input/card/dialog — PR-5 §4: "whichever prove genuinely needed by 2+
apps") actually earn their way into the shared package once building this
reveals real duplication with `apps/office`. Exact component breakdown is
implementation-PR detail.

## What this unblocks

Phase 4 links discovered documents to real cases (case list/detail pages
exist to link against). Phase 5's search results can deep-link into a real
case detail view. Phase 6's email-case-matching has real cases to match
against instead of Phase 1's bare schema.

## Open risks / follow-ups

- Wiring existing Contacts (ASC-109) into the new case-detail tab set is a
  real, valuable follow-up — explicitly not this phase's job.
- Calendar sync-engine/reminder implementation detail (polling interval,
  notification mechanism — backend has no desktop-style OS notification
  surface; likely email or in-app only) is deferred to the implementation
  PR, not decided here.
