import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../database";
import { cases } from "../../database/schema";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

type CaseRow = typeof cases.$inferSelect;

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
