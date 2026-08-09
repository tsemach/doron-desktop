import { eq, inArray } from "drizzle-orm";
import { db } from "../database";
import { teamMembers, teams, users, flatGroupMembers } from "../database/schema";

// ASC-142 role model. "admin" is never self-assignable through canInvite/
// canChangeRole below -- it's only ever set by accepting an office-issued
// invitation (see lib/org/invitations.ts), a path these functions don't
// gate at all.
export type Role = "admin" | "manager" | "user" | "flat";

export interface Actor {
  id: string;
  role: Role;
  firmId: string | null;
}

export interface Target {
  id: string;
  role: Role;
  firmId: string | null;
}

// Total BFS iterations across getManagerMemberUserIds, not a depth count --
// just a generous cap against an accidental manager-reports-to-manager
// cycle (which shouldn't be possible to create, but this is cheap
// insurance against an infinite loop if it ever is).
const MAX_MANAGER_QUEUE_ITERATIONS = 50;

// Rule 1/2/3/13 -- admin invites manager|user, manager invites user,
// flat invites flat. "admin" is never an invitable target here regardless
// of actor: the only way to create one is apps/office's dedicated
// invite-admin route, which doesn't call this function at all.
export function canInvite(actor: Actor, targetRole: Role): boolean {
  if (targetRole === "admin") return false;
  if (actor.role === "admin") return targetRole === "manager" || targetRole === "user";
  if (actor.role === "manager") return targetRole === "user";
  if (actor.role === "flat") return targetRole === "flat";
  return false;
}

// Rule 11 -- only an admin can change a user's role, only between manager
// and user (never touching admin/flat), only within their own firm.
export function canChangeRole(actor: Actor, target: Target): boolean {
  return (
    actor.role === "admin" &&
    (target.role === "manager" || target.role === "user") &&
    actor.firmId !== null &&
    actor.firmId === target.firmId
  );
}

// Rule 12 -- only an admin can delete a user or manager, only within their
// own firm. The caller is responsible for performing a soft delete; this
// function only says whether the action is allowed.
export function canDelete(actor: Actor, target: Target): boolean {
  return actor.role === "admin" && actor.firmId !== null && actor.firmId === target.firmId;
}

// Rules 5-7 -- the member-visibility scope for the current actor: who this
// actor can see/manage as an account, not case/document data -- see
// docs/identity-and-roles/design.md's non-goals.
export async function getVisibleMemberUserIds(actor: Actor): Promise<string[]> {
  if (actor.role === "admin") {
    if (!actor.firmId) return [actor.id];
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.firmId, actor.firmId));
    return rows.map((r) => r.id);
  }

  if (actor.role === "manager") {
    return getManagerMemberUserIds(actor.id);
  }

  if (actor.role === "flat") {
    return getFlatMemberUserIds(actor.id);
  }

  // Plain "user" role -- no reports, sees only themself.
  return [actor.id];
}

// BFS from the teams the manager directly owns, recursing into any member
// who is themself a manager (their owned teams too) -- this is what "a
// manager can manage a team of managers" (rule 6) means for member
// visibility: everyone underneath, transitively.
async function getManagerMemberUserIds(managerId: string): Promise<string[]> {
  const visibleUserIds = new Set<string>([managerId]);
  const visitedManagers = new Set<string>();
  const managerQueue: string[] = [managerId];
  let iterations = 0;

  while (managerQueue.length > 0 && iterations < MAX_MANAGER_QUEUE_ITERATIONS) {
    iterations++;
    const currentManagerId = managerQueue.shift()!;
    if (visitedManagers.has(currentManagerId)) continue;
    visitedManagers.add(currentManagerId);

    const ownedTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.managerId, currentManagerId));
    if (ownedTeams.length === 0) continue;

    const teamIds = ownedTeams.map((t) => t.id);
    const members = await db
      .select({ userId: teamMembers.userId, role: users.role })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(inArray(teamMembers.teamId, teamIds));

    for (const member of members) {
      visibleUserIds.add(member.userId);
      if (member.role === "manager" && !visitedManagers.has(member.userId)) {
        managerQueue.push(member.userId);
      }
    }
  }

  return Array.from(visibleUserIds);
}

// Rule 13 -- a flat user's peers are whoever shares their flatGroupMembers
// row (at most one group per flat user). No group yet -- e.g. never
// invited/joined anyone -- means only themself is visible.
async function getFlatMemberUserIds(actorId: string): Promise<string[]> {
  const [membership] = await db
    .select({ groupId: flatGroupMembers.groupId })
    .from(flatGroupMembers)
    .where(eq(flatGroupMembers.userId, actorId))
    .limit(1);

  if (!membership) return [actorId];

  const rows = await db
    .select({ userId: flatGroupMembers.userId })
    .from(flatGroupMembers)
    .where(eq(flatGroupMembers.groupId, membership.groupId));

  return rows.map((r) => r.userId);
}
