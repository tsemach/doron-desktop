import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../database";
import { cases } from "../../database/schema";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

export type CaseRow = typeof cases.$inferSelect;

// The visibility substrate every later phase (3, 4, 5, 6) writes against --
// see docs/backend-saas/phase-1-data-foundation/design.md. Reuses
// getVisibleMemberUserIds (ASC-142's team-membership roll-up) as-is for
// every role, rather than a case-specific visibility mechanism: admin sees
// firm-wide, manager sees their team roll-up (recursing into sub-managed
// teams), flat sees flatGroup peers, plain "user" sees only themself.
//
// tasks/documents/case-linked meetings inherit visibility transitively
// through their case's userId (JOIN cases ON ... WHERE cases.user_id IN
// (...)) rather than each carrying independent scoping logic -- this
// function is the base every later phase's own visibility query builds on.
export async function listVisibleCases(actor: Actor): Promise<CaseRow[]> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  return db
    .select()
    .from(cases)
    .where(and(inArray(cases.userId, visibleUserIds), isNull(cases.deletedAt)))
    .orderBy(desc(cases.createdAt));
}

// Single-case lookup, scoped through the same visibility set as
// listVisibleCases -- never an unfiltered select-by-id. An unscoped lookup
// would leak whether a given case UUID exists at all outside the actor's
// tenant, the same existence-oracle class of bug already fixed once in
// this codebase for contacts (ASC-172, shareContact/unshareContact).
// Returns undefined for "doesn't exist" and "exists but not visible to
// this actor" alike -- the caller can't distinguish them, by design.
export async function getVisibleCaseById(actor: Actor, id: string): Promise<CaseRow | undefined> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const [row] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, id), inArray(cases.userId, visibleUserIds), isNull(cases.deletedAt)))
    .limit(1);
  return row;
}

// Mutation permission model (Phase 1's design deliberately left this
// undecided -- resolved here, in Phase 3, matching contacts' precedent for
// consistency across the app's two RBAC-scoped resource types, not a fresh
// judgment call): anyone in the visibility set can edit -- a manager's
// oversight into their team's cases is meant to be actionable, not just
// read-only. Delete is owner-only, same asymmetry contacts' deleteContact
// already established.

export interface CreateCaseFields {
  name: string;
  subject?: string;
}

export type CreateCaseResult = { case: CaseRow } | { error: string; status: number };

export async function createCase(actor: Actor, fields: CreateCaseFields): Promise<CreateCaseResult> {
  const name = fields.name.trim();
  if (!name) {
    return { error: "Name is required", status: 400 };
  }

  const [row] = await db
    .insert(cases)
    .values({ userId: actor.id, name, subject: fields.subject?.trim() || null })
    .returning();

  return { case: row };
}

export interface UpdateCaseFields {
  name?: string;
  subject?: string;
  status?: string;
}

export type UpdateCaseResult = { case: CaseRow } | { error: string; status: number };

// Visibility-gated, not ownership-gated -- see the permission-model note
// above. Uses getVisibleCaseById rather than an unfiltered select-by-id,
// same existence-oracle-safe convention as listVisibleCases.
export async function updateCase(actor: Actor, id: string, fields: UpdateCaseFields): Promise<UpdateCaseResult> {
  const existing = await getVisibleCaseById(actor, id);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  const [updated] = await db
    .update(cases)
    .set({
      name: fields.name?.trim() || existing.name,
      subject: fields.subject !== undefined ? fields.subject.trim() || null : existing.subject,
      status: fields.status ?? existing.status,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, id))
    .returning();

  return { case: updated };
}

export type DeleteCaseResult = { success: true } | { error: string; status: number };

// Owner-only (see the permission-model note above), soft delete via
// deletedAt -- matching users.deletedAt's convention, not a hard DELETE.
// Visibility-scoped lookup first, same existence-oracle-safe convention:
// 404 if the actor can't see the case at all, 403 if they can see it but
// don't own it, never leaking which case exists to a caller outside their
// tenant.
export async function deleteCase(actor: Actor, id: string): Promise<DeleteCaseResult> {
  const existing = await getVisibleCaseById(actor, id);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }
  if (existing.userId !== actor.id) {
    return { error: "Only the owner can delete this case", status: 403 };
  }

  await db.update(cases).set({ deletedAt: new Date() }).where(eq(cases.id, id));
  return { success: true };
}
