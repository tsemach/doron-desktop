# Phase 1: Tenant-scoped data foundation — design

**Linear issue:** [ASC-181](https://linear.app/amicusx/issue/ASC-181) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
("Add fully backend support (SaaS)")
**Status:** Design — not yet implemented. See
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) for how this
fits the overall phase stack (PR-1, stacked on PR-0).
**Date:** 2026-08-22

This document covers **Phase 1 only**: a decision on the data model and
visibility pattern, and its rationale — not the Drizzle `schema.ts` edits or
migration themselves. A future implementation PR builds directly against
the schema below, matching how `PR-3`/`PR-5` (ASC-105) were each scoped as
decision docs with implementation deferred to a following PR.

## Goals

- Give every later phase (3, 4, 5, 6, 7) a settled Postgres schema to build
  against: cases, tasks, task/case/doc templates, documents (Phase 5's
  search-index target), and calendar/meetings.
- Define one reusable ownership/visibility pattern for case-rooted content,
  reusing existing infrastructure (`getVisibleMemberUserIds`) rather than
  inventing a parallel mechanism.
- Resolve, explicitly, the two open questions from the master plan's
  clarifying round: automatic roll-up vs. explicit sharing (roll-up), and
  firm-wide vs. per-user templates (firm-wide) — both already decided;
  this document is where the resulting schema gets written down precisely.

## Non-goals (explicitly deferred)

- Any actual `packages/backend-orm/src/schema.ts` edit, `drizzle-kit
  generate` migration, or Rust/desktop code — a future implementation PR.
- Phase 3's API routes and UI, Phase 4's document-discovery flow, Phase 5's
  extraction/embedding tables (`documentChunks` etc.) — this document only
  shapes the `documents` table Phase 5 will build on top of.
- Enforcement of "only admin/manager can edit firm templates" as running
  code — that's a Phase 3 API-route concern; this document only shapes the
  schema that makes such enforcement possible.

## Decision: ownership & visibility model

- **`cases`** are owned by a `userId` (the creator). No `firmId` column on
  the table — firm membership is derived fresh via join to `users` at query
  time, same anti-staleness convention `contacts` already uses (a user
  later changing firms doesn't leave stale scoping data on their cases).
- **Visibility for a case**: `WHERE cases.userId IN
  (getVisibleMemberUserIds(actor))` — reusing the existing team-membership
  BFS (`apps/backend/lib/permissions.ts`) as-is, for every role including
  `flat` (flatGroup peers see each other's cases, consistent with how they
  already see each other's contacts).
- **`tasks`, `documents`, and case-linked `meetings` inherit visibility
  transitively through their parent case** (`JOIN cases ON
  tasks.caseId = cases.id WHERE cases.userId IN (...)`), rather than each
  carrying independent ownership/scoping logic. One case, one owner
  (`getVisibleMemberUserIds`-scoped), one visibility chain for everything
  filed under it.
- **`meetings` not linked to a case** anchor visibility to their own
  `userId` directly — a meeting always has a connecting user regardless of
  case link.
- **Templates are the one exception**: owned by the firm itself (`firmId`
  FK, not derived) since a template should survive a user leaving the firm
  — it's firm property, not personal property that happens to be shared.
  Flat users get personal templates (`firmId` null, own `userId`).
- **Ownership checks for mutations always go through the same
  visibility-filtered lookup**, never an unfiltered select-by-id — matching
  `contacts`' existing convention of not leaking whether a UUID exists
  outside the caller's tenant (`apps/backend/lib/contacts/crud.ts:306-311`).

### Example: "get me all my cases" as a manager

```ts
// apps/backend/lib/cases/crud.ts
import { and, desc, inArray, isNull } from "drizzle-orm";
import { db } from "../../database";
import { cases } from "../../database/schema";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

export async function listVisibleCases(actor: Actor) {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  return db
    .select()
    .from(cases)
    .where(and(inArray(cases.userId, visibleUserIds), isNull(cases.deletedAt)))
    .orderBy(desc(cases.createdAt));
}
```

For a manager, `getVisibleMemberUserIds` dispatches to
`getManagerMemberUserIds` (`permissions.ts:88-119`), which seeds the
visible-id set with the manager's own id (line 89), then BFS-walks teams
they own → `teamMembers` → recursing into any member who is themself a
manager (rule 6: "manager can manage a team of managers"), capped at 50
total BFS iterations as cycle insurance. The resulting id list feeds one
`WHERE cases.user_id IN (...)` for the actual case query — Phase 1
introduces no new query-cost pattern, it reuses the one member-visibility
already has.

This same `listVisibleCases` function is the intended single choke-point
for the "get one case" (fetch-by-id-within-the-visible-set) and
update/delete ownership checks, mirroring `getVisibleContactRows`'s role
for `contacts`.

## Schema

```ts
export const cases = pgTable("cases", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  userId: t.text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: t.text("name").notNull(),
  subject: t.text("subject"),
  status: t.text("status").notNull().default("open"), // loose text, matching desktop's own lack of a CHECK
  deletedAt: t.timestamp("deleted_at"), // soft delete, matching users.deletedAt convention
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  updatedAt: t.timestamp("updated_at").defaultNow().notNull(),
}));

export const taskStatusEnum = pgEnum("task_status", ["Waiting", "In progress", "Cancel", "Done"]);
export const estimateUnitEnum = pgEnum("estimate_unit", ["day", "hour"]);

export const tasks = pgTable("tasks", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  caseId: t.uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  title: t.text("title").notNull(),
  description: t.text("description"),
  status: taskStatusEnum("status").notNull().default("Waiting"),
  estimateValue: t.real("estimate_value"),
  estimateUnit: estimateUnitEnum("estimate_unit"), // nullable together with estimateValue, app-layer invariant
  dueDate: t.timestamp("due_date"),
  taskTemplateItemId: t.uuid("task_template_item_id").references(() => taskTemplateItems.id, { onDelete: "set null" }),
  sortOrder: t.integer("sort_order").notNull().default(0),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  updatedAt: t.timestamp("updated_at").defaultNow().notNull(),
}));

// Phase 5's search-index target — minimal now; Phase 5 adds documentChunks
// (text + embedding) FK'd to this table.
export const documents = pgTable("documents", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  caseId: t.uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }), // mandatory — deliberate deviation from desktop, which has no case_id on documents at all
  fileName: t.text("file_name").notNull(),
  relativePath: t.text("relative_path").notNull(), // "/"-joined path relative to the case's connected root folder (e.g. "contracts/nda.pdf") — NOT an absolute OS path. Corrected in Phase 4's design: the File System Access API never exposes one (FileSystemHandle has only .name, by spec, for privacy). Used only to re-locate a file within the client-side-persisted directory handle (see Phase 4) — never a way to open the file server-side.
  addedByUserId: t.text("added_by_user_id").notNull().references(() => users.id), // provenance only, not used for visibility
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}));

// Firm-owned (or personal for flat users) — not derived from a user relationship.
// docTemplates, taskTemplates + taskTemplateItems, caseTemplateDocs follow this exact firmId/userId shape.
export const caseTemplates = pgTable("case_templates", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  firmId: t.text("firm_id").references(() => firms.id, { onDelete: "cascade" }), // null for flat/personal
  userId: t.text("user_id").references(() => users.id, { onDelete: "cascade" }), // set only when firmId is null
  createdByUserId: t.text("created_by_user_id").notNull().references(() => users.id),
  name: t.text("name").notNull(),
  fields: t.jsonb("fields"), // mirrors desktop's JSON fields column
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}));

export const googleCalendarAccounts = pgTable("google_calendar_accounts", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  userId: t.text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }), // personal OAuth grant, one per user, never shared even with a manager
  googleEmail: t.text("google_email").notNull(),
  accessToken: t.text("access_token").notNull(),
  refreshToken: t.text("refresh_token").notNull(),
  tokenExpiresAt: t.timestamp("token_expires_at").notNull(),
  syncToken: t.text("sync_token"),
  connectedAt: t.timestamp("connected_at").defaultNow().notNull(),
}));

export const meetingStatusEnum = pgEnum("meeting_status", ["confirmed", "tentative", "cancelled"]);
export const caseLinkSourceEnum = pgEnum("case_link_source", ["none", "phrase_match", "manual"]);

export const meetings = pgTable("meetings", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  googleEventId: t.text("google_event_id").notNull().unique(),
  userId: t.text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // visibility anchor
  caseId: t.uuid("case_id").references(() => cases.id, { onDelete: "set null" }), // optional link, metadata only
  title: t.text("title").notNull(),
  description: t.text("description"),
  location: t.text("location"),
  startTime: t.timestamp("start_time").notNull(),
  endTime: t.timestamp("end_time").notNull(),
  status: meetingStatusEnum("status").notNull().default("confirmed"),
  caseLinkSource: caseLinkSourceEnum("case_link_source").notNull().default("none"),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  updatedAt: t.timestamp("updated_at").defaultNow().notNull(),
}));
```

All new tables use `uuid().defaultRandom()` for their own `id` (the
majority/newer convention already in `packages/backend-orm/src/schema.ts`
— 9 of 13 non-auth tables), and `text(...)` for every FK into `users.id`/
`firms.id`, matching those two tables' actual column type
(`text("id").primaryKey().$defaultFn(() => crypto.randomUUID())`, not
Postgres-native `uuid`).

## Edge cases

- **Flat user with no group**: `getFlatMemberUserIds` already returns
  `[actorId]` when no `flatGroupMembers` row exists — Phase 1 needs no new
  handling, it inherits this for free by reusing the function as-is.
- **Manager BFS cycle safety**: the existing 50-iteration cap in
  `getManagerMemberUserIds` applies unchanged; Phase 1 adds no new cycle
  risk since it doesn't touch the `teams`/`teamMembers` graph.
- **Soft-deleted cases**: excluded by default via `isNull(cases.deletedAt)`
  in `listVisibleCases`, matching the `deletedAt is null` convention already
  used in `verifyCredentials`/`authorizeOrgRequest`.
- **Document without a case**: not representable — `documents.caseId` is
  `NOT NULL`. Phase 4's document-discovery flow must resolve or create a
  case before it can register a document; this is a deliberate constraint,
  not an oversight (see Non-goals — Phase 4 owns designing that flow).
- **Template `firmId`/`userId` mutual exclusivity**: an app-layer
  invariant (exactly one of the two is set), not yet a DB-level guarantee
  in the schema above. The implementation PR should add a `CHECK
  ((firm_id IS NOT NULL AND user_id IS NULL) OR (firm_id IS NULL AND
  user_id IS NOT NULL))` constraint per template table rather than relying
  on application code alone.

## What this unblocks

- Phase 3's Cases/Tasks/Calendar/Templates pages query against this schema
  directly via `listVisibleCases`-style functions.
- Phase 4 links discovered documents to `documents.caseId`.
- Phase 5 adds a `documentChunks` table FK'd to `documents.id`, following
  the same transitive-visibility-through-case pattern.
- Phase 6's email ingestion gets a settled `cases`/`caseId` shape to link
  matched emails against.
