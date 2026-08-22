# Ascurix Backend SaaS Parity — Master Plan

**Linear issue:** [ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas) — "Add fully backend support (SaaS)"
**Date:** 2026-08-22
**Status:** Decomposition approved. Design-doc PRs open for Phase 1
([PR-1](https://github.com/tsemach/doron-desktop/pull/197), reviewed in
conversation — ownership/visibility model + schema walked through,
including a concrete manager-visibility query trace) and Phase 2
([PR-2](https://github.com/tsemach/doron-desktop/pull/198), adopts PR-5
(ASC-105) as-is, re-verified against current code — no drift found). Base
plan doc itself is [PR-0](https://github.com/tsemach/doron-desktop/pull/196).
Schema/UI implementation for Phases 1-2 are still follow-up PRs, not yet
started. Phase 3 design not yet started.

This document is a **decomposition**, not a design — it records the scope, order,
and dependency graph of the sub-projects ASC-179 breaks into, and the
architectural decisions that shape all of them. Each phase below gets its own
brainstorm → design doc → implementation plan cycle before any code is
written for it, following this repo's standard process
(`.claude/rules` + `superpowers:brainstorming`/`writing-plans`).

## PR stack & branching — read this first if resuming after a restart

This plan ships as a **stack of branches**, one per phase, each stacked on
its predecessor — same convention as `docs/task-management/plan.md`'s
branch stack. **Implementation proceeds bottom-up** (each branch depends on
the code below it) but **merges top-down**: once everything is approved,
the tip of the stack merges into its parent first, cascading all the way
down, with PR-0 merging into `master` last.

| # | Linear issue | Branch | Carries | Depends on |
|---|---|---|---|---|
| PR-0 | ASC-179 | `tsemachmizrachi/asc-179-add-fully-backend-support-saas-pr-0` | This master plan doc (`docs/backend-saas/masterplan/plan.md`) | `master` |
| PR-1 | [ASC-181](https://linear.app/amicusx/issue/ASC-181) | `tsemachmizrachi/asc-181-phase-1-tenant-scoped-data-foundation` | Phase 1 design ([doc](../phase-1-data-foundation/design.md), decision-only — matches PR-3/PR-5's scoping; schema implementation is a follow-up PR) | PR-0 |
| PR-2 | [ASC-182](https://linear.app/amicusx/issue/ASC-182) | `tsemachmizrachi/asc-182-phase-2-shared-ui-foundation-packagesui-theme-button-desktop` | Phase 2 design ([doc](../phase-2-shared-ui/design.md), decision-only — adopts PR-5 as-is; implementation is a follow-up PR) | PR-1 |
| PR-3 | [ASC-183](https://linear.app/amicusx/issue/ASC-183) | `tsemachmizrachi/asc-183-phase-3-core-backend-pages-cases-tasks-calendar-templates` | Phase 3 | PR-2 |
| PR-4 | [ASC-184](https://linear.app/amicusx/issue/ASC-184) | `tsemachmizrachi/asc-184-phase-4-local-document-access-browser-file-system-access-api` | Phase 4 | PR-3 |
| PR-5 | [ASC-185](https://linear.app/amicusx/issue/ASC-185) | `tsemachmizrachi/asc-185-phase-5-search-and-indexing-server-side-persisted-index` | Phase 5 | PR-4 |
| PR-6 | [ASC-186](https://linear.app/amicusx/issue/ASC-186) | `tsemachmizrachi/asc-186-phase-6-email-ingestion-and-classification-parity` | Phase 6 | PR-5 |
| PR-7 | [ASC-187](https://linear.app/amicusx/issue/ASC-187) | `tsemachmizrachi/asc-187-phase-7-multi-tenancyrbac-hardening-pass` | Phase 7 | PR-6 |

A single strict linear stack (PR-0 → PR-1 → ... → PR-7) — not a branching
tree. Phase 6 is logically independent of Phases 2-5 (per its own
dependency note below), but the branch stack is sequential regardless, so
it's built and reviewed in that same top-down order.

**Process rules**:
1. **Approval gate (revised 2026-08-22):** originally "stop after every PR
   and wait for approval," matching `docs/task-management/plan.md`'s
   convention. Superseded by explicit instruction — proceed through
   Phases 3-7 autonomously, creating each design-doc PR without waiting
   for review in between. Stop only for a genuine conflict, or a decision
   with no confidently-correct answer (surface it and ask, rather than
   guessing) — not merely "this phase has an open question," if research
   can resolve it with a well-reasoned recommendation.
2. **Merge order (top-down)**: PR-7 merges into PR-6/PR-5 (whichever it
   stacked on), cascading down through PR-1, and finally PR-0 merges into
   `master` last. Each PR's GitHub base is its stack predecessor.
3. Before starting a phase's branch, its own design work happens first
   (per the top of this doc) — the branch is opened once that phase's
   design is written, not before. Each design-doc PR is decision-only,
   matching PR-3/PR-5's (ASC-105) scoping — schema/code implementation is
   always a follow-up PR, not bundled into the design PR.

**If resuming this work after a restart**: run `git branch --show-current`
and `git stack` (see the `git-stack` skill) to see which branch is checked
out and where it sits in the stack, then check this table and the Status
line above to see which PR is next.

## Relationship to prior work — read this first

ASC-179 is **not** the first attempt at "desktop functionality in the
backend." [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend)
("Add user area in the backend", completed 2026-08-14) already shipped the
private-area shell, a mock-data opening dashboard, and two decision docs this
plan depends on and must not contradict:

- **[ASC-142](../../identity-and-roles/design.md)** ("Add multi-role users
  support", merged) — `admin`/`manager`/`user`/`flat` roles, `firms`, `teams`,
  `teamMembers`, `invitations`, `flatGroups` already exist in
  `packages/backend-orm/src/schema.ts` and are live in both `apps/backend`
  and the desktop app's Settings → "Users and Roles" tab. **This plan treats
  ASC-142 as a finished prerequisite, not something to rebuild.** Phase 1
  below only adds tenant-scoping *columns* to new tables, reusing the
  existing `getVisibleMemberUserIds`-style visibility pattern already
  proven on `contacts`/`contactShares`.
- **[PR-3 — cases/documents data-ownership decision](../../superpowers/specs/2026-08-13-pr-3-cases-documents-data-ownership-design.md)**
  decided: desktop remains the sole, unconditional source of truth for a
  user's *existing* local case/document content; the only thing that ever
  reaches the backend is an opt-in, one-directional Cloud Backup (never
  built — verified zero hits for `document_backups`/`caseDocumentBackups`
  in the codebase today). **ASC-179 does not reverse this decision.**
  Nothing in this plan syncs, mirrors, or uploads a user's existing desktop
  SQLite data. Instead, the backend gets its own, independently-populated
  case/task/calendar data model (§ "Core architectural decisions" below) —
  a firm's users create and manage SaaS-side cases directly through the
  browser. A user's desktop cases and their backend/SaaS cases are separate
  data by design; any overlap is the user's own doing (e.g. re-entering the
  same matter in both places), not automatic sync. Cloud Backup itself
  remains a valid, separate, still-unbuilt feature this plan neither
  requires nor precludes.
- **[PR-5 — shared UI strategy](../../superpowers/specs/2026-08-15-pr-5-shared-ui-strategy-design.md)**
  decided `packages/ui`'s scope: generic, logic-free presentational
  primitives only (Button, theme tokens) — never business/data-bound
  components — because desktop's and backend's data-fetching mechanics
  (Tauri `invoke()` vs. Next.js API/DB) were expected to stay fundamentally
  different. That expectation still holds under this plan's "independent
  backend rebuild" decision, so **PR-5's scope boundary still stands and
  Phase 2 below is its implementation**, not a re-decision.

`PRD.md`/`PLAN.md` predate ASC-142 and describe a stale, pre-multi-tenant
snapshot of the system (explicitly calling multi-user/firm accounts
out-of-scope) — they should be treated as historical, not authoritative,
until updated.

## Core architectural decisions (apply to every phase below)

Resolved through discussion for ASC-179 specifically; each phase's own
brainstorm should treat these as settled inputs, not open questions:

1. **Data ownership: independent backend rebuild, not sync.** Desktop is
   unchanged in behavior (per requirement 5) and stays fully local/offline.
   Backend Postgres (`packages/backend-orm`) gets its own case/task/
   template/calendar tables, populated only through backend-side user
   action (browser CRUD). No sync engine, no migration path from desktop
   SQLite, no attempt to reconcile the two. This is a deliberate
   duplication of *capability*, not of any specific user's *data*.
2. **Documents: symmetric local-disk model, no cloud-provider API
   integration.** The backend does not integrate with OneDrive/Dropbox/
   Google Drive APIs, and does not store a server-side copy of raw file
   bytes. Instead, the backend's Documents page reads a user-granted local
   folder live via the browser's File System Access API
   (`showDirectoryPicker()`), exactly mirroring how desktop's Rust backend
   reads the same OS-mounted path today — including the limitation that it
   only works on a device where that folder is actually present/mounted.
   This is a hard platform constraint accepted deliberately, not a gap:
   **Chromium-only** (Chrome/Edge); Safari/Firefox lack this API.

   **Rejected alternative: real OneDrive/Dropbox/Google Drive API
   integration.** Considered and explicitly rejected, not just unconsidered:
   - **Scope**: three independent integrations (different OAuth flows, API
     shapes, rate limits, and change-notification mechanisms — Graph delta
     queries + expiring webhook subscriptions, Google `changes.list` + push
     channels capped at 24h, Dropbox cursor/webhook), each roughly
     Phase-4-sized on its own — not a fit for one phase.
   - **Security/compliance**: reading an *existing* folder a user already
     organized (not just app-created files) requires broad scopes. Google
     treats broad Drive scopes as "restricted," triggering OAuth
     verification and a paid third-party CASA security assessment
     (recurring annually). Firms realistically run Microsoft 365 for
     Business, where Graph access typically needs the **firm's IT admin**
     to grant tenant-wide consent — an onboarding dependency outside the
     end user's control. Storing broad-scope refresh tokens per tenant
     means a backend compromise exposes a firm's *entire* Drive/OneDrive,
     not just Ascurix case folders — a materially bigger trust ask than
     the opt-in, narrow, one-directional backup PR-3 (ASC-105) deliberately
     chose for this exact reason, and in tension with `PRD.md`'s stated
     local-first/privacy constraint.
   - **Operational cost**: three hard external dependencies on third-party
     uptime/API versioning become Ascurix production incidents, not "the
     user's OS sync broke."
   - **What it would have bought**: cross-device access without the local
     mount present on that specific device/browser, and non-Chromium
     browser support — real capability, but judged disproportionate to the
     cost/risk above. Local-disk-symmetric access (this decision) stands.
3. **Search index is persisted server-side; raw files are not.** Extracted
   text chunks, embeddings, and document metadata (title, case link, tags)
   generated from a browser-side local scan are stored in Postgres per
   tenant, so search/browse works from any device/session without the
   mount present. Opening/viewing the actual file still requires a device
   where the mount is present — only the *index* is centralized, not the
   content.
4. **Email ingestion and AI-powered search are in scope for this plan**
   (not deferred to a later, separate initiative) — both get their own
   phase below.

## Phase breakdown

```
Phase 1 (foundation)
   │
   ├──> Phase 2 (shared UI) ──────────────┐
   │                                       ▼
   └─────────────────────────────> Phase 3 (core pages: Cases/Tasks/Calendar/Templates)
                                            │
                                            ▼
                                   Phase 4 (local document access)
                                            │
                                            ▼
                                   Phase 5 (search & indexing)

Phase 6 (email ingestion) — independent of 3-5, can start after Phase 1
Phase 7 (multi-tenancy/RBAC hardening) — after Phases 1-6 exist
```

### Phase 1 — Tenant-scoped data foundation

New tables in `packages/backend-orm/src/schema.ts`: cases, tasks, task
templates, doc templates, case templates, calendar/meetings, document
metadata (the Phase 5 search-index target) — each carrying `firmId`/
`userId`/`teamId` ownership and RBAC query-scoping rules (admin: firm-wide;
manager: team, recursing into sub-managed teams per ASC-142's
`getVisibleMemberUserIds`; user: own; flat: own + flat-group peers),
modeled directly on the existing `contacts`/`contactShares` pattern. No
user-facing UI — this is the substrate every later phase writes against.
**Blocks Phases 3, 4, 5, 6, 7.**

### Phase 2 — Shared UI foundation

Implements PR-5's already-decided, not-yet-built design in full: the
desktop-as-`packages/ui`-consumer Vite spike (HMR, real `vite build`,
no duplicate-version bloat), theme-token unification (desktop's OKLCH block
becomes the single source of truth for backend + office), and Button
canonicalization (desktop's CVA+Radix version moves into `packages/ui`,
migrating the 19 existing call sites across backend+office). Scope stays
exactly what PR-5 defined: generic presentational primitives only, no
business/data-bound components. **Blocks Phase 3.**

### Phase 3 — Core backend pages: Cases, Tasks, Calendar, Templates

Replaces the `ComingSoon` stubs (`apps/backend/app/app/{cases,tasks,
calendar}/page.tsx`) with real CRUD UI against Phase 1's schema, built with
Phase 2's shared primitives, mirroring desktop's `CaseManagement`/
`TaskManagement`/`Calendar` UX (see `docs/task-management/plan.md` and
`docs/calendar/design.md` for the desktop data shapes/UX to mirror — not to
duplicate verbatim, since backend's schema and multi-tenant scoping
differ). Nav bar update: drop the top-level "Tasks" item (requirement 3;
Billing unchanged); where task functionality surfaces instead — nested in
Cases, a Home dashboard card, or both — is a decision for this phase's own
brainstorm. **Depends on Phases 1, 2. Blocks Phase 4.**

### Phase 4 — Local document access

Backend Documents page uses `showDirectoryPicker()` to read a user-granted
local folder live (per Core Decision 2), linking discovered files to Phase
1's case/document-metadata tables. No raw file upload, no server-side
storage of file bytes. Chromium-only constraint gets a concrete UX answer
in this phase (e.g. a Safari/Firefox fallback message) rather than being
silently broken. **Depends on Phase 3 (cases must exist to link documents
to). Blocks Phase 5.**

### Phase 5 — Search & indexing

Extraction/embeddings/FTS+vector hybrid search over documents discovered in
Phase 4, with resulting text/embeddings/metadata persisted server-side in
Postgres per tenant (Core Decision 3). Open implementation question for
this phase's own brainstorm: reuse desktop's Rust extractor/embeddings
logic (exposed as a service) vs. reimplement in Node for the Next.js
runtime — not decided here. **Depends on Phase 4.**

### Phase 6 — Email ingestion & classification

Server-side IMAP polling + classification pipeline, mirroring desktop's
`email/` module (`emails_ingestion.rs`, `emails_orchestrate.rs`,
`emails_classify*.rs`) reimplemented against Phase 1's tenant-scoped
schema. Likely shares LLM-provider plumbing with Phase 5. **Depends on
Phase 1 only** — can proceed in parallel with Phases 2-5.

### Phase 7 — Multi-tenancy/RBAC hardening pass

Cross-cutting audit once Phases 1-6 exist: verify tenant isolation and
role-scoping (admin/manager/user/flat × firm/team) actually holds across
every new resource and API route introduced above — not a new feature,
a verification and gap-closing pass. **Depends on Phases 1-6.**

## Explicitly out of scope for this master plan

- Any change to desktop's local SQLite schema, offline behavior, or sync
  capability — desktop stays exactly as-is per requirement 5.
- Cloud-storage-provider (OneDrive/Dropbox/Drive) OAuth/API integration —
  explicitly rejected in favor of Core Decision 2.
- Building or reviving PR-3's Cloud Backup feature — remains a separate,
  optional, independently-schedulable feature.
- Two-way sync or conflict resolution of any kind between desktop and
  backend data.
