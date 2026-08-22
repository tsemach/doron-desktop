# Phase 7: Multi-tenancy/RBAC hardening pass — design

**Linear issue:** [ASC-187](https://linear.app/amicusx/issue/ASC-187) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
**Status:** Design — not yet implemented (necessarily; Phases 1-6 must exist first).
**Date:** 2026-08-22

Covers **Phase 7 only**, per
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) (PR-7,
stacked on PR-6). Unlike Phases 1-6, this phase has no fresh architectural
fork to resolve — it's a verification checklist against what those phases
actually build, not a new design. This document defines the checklist now
so the implementation PR has concrete acceptance criteria, rather than an
open-ended "audit everything" mandate.

## Goals

Verify, with automated tests (not manual QA alone), that tenant isolation
and role-scoping actually hold across every resource introduced by Phases
1-6 — closing gaps, not building features.

## Non-goals

- Any new resource type or user-facing feature.
- Redesigning the visibility model itself (Phase 1's `getVisibleMemberUserIds`
  reuse stands) — this phase checks it's applied correctly everywhere, not
  whether it's the right model.

## Checklist

1. **No unscoped select-by-id anywhere.** Every "get one" endpoint across
   `cases`/`tasks`/`documents`/`documentChunks`/`caseTemplates`/etc./
   `meetings`/`caseEmails` fetches through its visibility-scoped list
   function (Phase 1's `listVisibleCases` pattern), never an unfiltered
   `WHERE id = ?`. **This is not a hypothetical risk** — this exact bug
   class already happened once in this codebase ("Fix existence-oracle
   leak in shareContact/unshareContact", ASC-172) — an unscoped lookup lets
   a caller confirm a UUID exists outside their tenant even if the full
   row is withheld. Grep-auditable: every Drizzle query against a Phase
   1-6 table should be traceable to a call site that first resolved a
   visibility-scoped id list.
2. **Cross-firm isolation tests, per resource type.** Automated tests (not
   manual): a user in firm A cannot list, read, update, or delete firm B's
   cases/tasks/documents/meetings/templates/emails, for every mutation
   route Phases 3/4/5/6 add.
3. **Role-boundary tests.** A manager sees only their actual roll-up (not
   sibling teams they don't manage); a `flat` user sees only their
   `flatGroup` peers, not arbitrary other flat users; a plain `user` sees
   only themself. Test each role against each resource type, not just
   `cases` once and assumed to generalize.
4. **Template `firmId`/`userId` mutual exclusivity is DB-enforced, not just
   app-layer.** Phase 1's design flagged this as needing a `CHECK`
   constraint — verify the implementation PR actually added it, not just
   assumed the application code would always get it right.
5. **AI Gateway quota/billing correctly attributes new callers.** Phase 5's
   `/embed` and Phase 6's classification calls both go through the
   existing `checkQuota`/`recordUsage` machinery — verify usage is
   attributed to the correct `userId` and that quota exhaustion actually
   blocks further `doc_indexing`/`email_classification` calls the same way
   it already blocks `chat`.
6. **OAuth token storage access control.** `googleCalendarAccounts` (Phase
   3) and `emailAccounts` (Phase 6) hold live refresh tokens — verify these
   are never returned in any list/get API response (write-only from the
   API's perspective once connected), and that only the owning `userId` can
   trigger a disconnect for their own account.
7. **Regression guard on Core Decision 2.** Verify no code path anywhere in
   Phases 3-5 accidentally introduced server-side raw file storage (e.g. a
   convenience file-upload endpoint added without noticing it violates the
   deliberate client-side-only architecture) — a structural check (e.g. no
   multipart/file-body handling on any `/api/v1/documents/*` route), not
   just a one-time read-through.
8. **Soft-delete filtering consistency.** Every visibility-scoped list
   query applies `isNull(table.deletedAt)` (or the resource's equivalent)
   the same way `listVisibleCases` does — a soft-deleted case's tasks/
   documents/meetings shouldn't resurface through a path that forgot the
   filter.

## What this unblocks

The end of the ASC-179 stack — once this phase's implementation PR lands
and its tests pass, the full stack (PR-0 through PR-7) is ready for its
top-down merge per the master plan's process rules.
