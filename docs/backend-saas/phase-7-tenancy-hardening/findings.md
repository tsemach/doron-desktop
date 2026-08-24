# Phase 7 audit findings

Results of running the 8-item checklist from
[`design.md`](./design.md) against everything Phases 1-6 actually built.
This is an audit record, not a new design — see `design.md` for the
checklist's own rationale.

## 1. No unscoped select-by-id anywhere

**Clean.** Every mutation across `cases`/`tasks`/`documents`/`meetings`
gates through its resource's visibility-scoped lookup
(`getVisibleCaseById`/`getVisibleTaskById`/`getVisibleDocumentById`/
`getVisibleMeetingById`) before any `.where(eq(table.id, id))` mutation
call. Verified by reading every `.where(eq(` call site across `lib/`
(`grep -rn ".where(eq(" apps/backend/lib/`) — the few unscoped-looking
ones (`cases/crud.ts:99`, `:122`; `documents/crud.ts:70`;
`tasks/crud.ts:108`; `calendar/crud.ts:101`) are all the *second* query
in a function that already gated visibility earlier in the same call, not
a fresh authorization decision.

`deleteCase`'s 403-vs-404 split (owner-only delete) does not reproduce
ASC-172's original leak: `getVisibleCaseById` already scoped `id` to the
actor's own visibility set before the ownership check runs, so a 403
response can only ever reveal "this case is visible to you but you don't
own it" (e.g., a teammate's case) — never a case outside the actor's
tenant, which correctly returns 404 either way.

## 2 & 3. Cross-firm isolation / role-boundary tests

**Partially covered, not exhaustive.** This codebase's existing test
convention (`lib/permissions.test.ts`) mocks the database entirely (a
FIFO-queue fake query chain) rather than running against a real Postgres
instance — there is no integration-test database configured in this
environment. Full per-resource cross-tenant integration tests would need
that infrastructure, which doesn't exist here; not built speculatively.
What *is* covered: `getVisibleMemberUserIds` itself (the shared roll-up
every resource's visibility depends on) already has role-boundary unit
tests from ASC-142. Every new resource's visibility function is a thin,
directly-readable wrapper around it (`inArray(table.userId,
visibleUserIds)`) — verified by reading, not by a mocked test that
couldn't validate the actual SQL `WHERE` clause anyway.

## 4. Template `firmId`/`userId` mutual exclusivity is DB-enforced

**Confirmed.** All three template tables' migration
(`drizzle/0008_petite_wither.sql`) includes a `CHECK` constraint (`grep -c
"firm_xor_user"` → 3), not just an application-layer assumption.

## 5. AI Gateway quota/billing attributes new callers correctly

**Confirmed.** Both `lib/ai/embed.ts` and `lib/email/classify.ts` call
`checkQuota`/`recordUsage`/`recordAiRequest` with the actor's real
`userId`, the same functions `/complete` already uses — no parallel
billing path was invented for either new caller.

## 6. OAuth token storage never exposed in API responses

**Confirmed clean** (`grep -rn "accessToken\|refreshToken"
apps/backend/app/api/v1/` → zero hits). Trivially true in one sense —
Phase 6's OAuth connect/callback routes were never built (see Phase 6's
PR) — but also means there is no existing code path that could leak a
token today.

## 7. Regression guard on Core Decision 2 (no server-side raw file storage)

**Confirmed clean** (`grep -rln "formData\|multipart"
apps/backend/app/api/v1/cases apps/backend/app/api/v1/documents` → zero
hits). No file-upload handling exists anywhere in the case/document
routes.

## 8. Soft-delete filtering consistency

**Confirmed clean.** Every direct query or join against `cases` includes
`isNull(cases.deletedAt)` — checked across `cases/crud.ts` (2 sites),
`tasks/crud.ts`'s cross-case join, `search/crud.ts`'s join, and
`email/caseMatch.ts`.

**Two real bugs found and fixed during this pass, unrelated to the
checklist itself:**

- `lib/tasks/crud.ts`'s `computeUrgency` checked `dueDate < now` before
  checking same-calendar-day, which — given tasks are created via a
  date-only `<input type="date">` parsed as UTC midnight — would have
  bucketed almost every same-day task as "overdue" for the rest of the
  day instead of "due-today". Fixed once (same-day checked first), then
  caught a *second*, deeper layer of the same bug live: the fix's own
  test suite failed on this exact machine, because the day comparison
  used local-timezone `getFullYear()`/`getMonth()`/`getDate()` while this
  environment runs in `Asia/Jerusalem` (UTC+3) — a same-UTC-day pair of
  timestamps landed on different local calendar days and the test caught
  it immediately. Re-fixed to compare in UTC throughout
  (`getUTCFullYear()` etc.), matching how `dueDate` was parsed in the
  first place. Covered by 4 unit tests; user-local (not just
  server-local) calendar-day correctness remains a genuinely open nuance,
  consistent with Calendar's own design doc flagging timezone handling as
  unresolved.
- `matchCaseByPhrase` (caught during Phase 6, listed here for
  completeness) used JS `&&` between two Drizzle SQL fragments instead of
  `and(...)`, silently dropping the soft-delete filter — fixed and
  covered by the case-matching test suite.
