import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../../database";
import { teamMembers, teams, users } from "../../database/schema";
import type { Actor, Role } from "../permissions";

export interface TeamMemberEntry {
  id: string;
  name: string | null;
  email: string;
  role: Role;
}

export interface TeamEntry {
  id: string;
  name: string;
  color: string | null;
  managerId: string;
  managerName: string | null;
  managerEmail: string;
  createdAt: Date;
  members: TeamMemberEntry[];
}

export type CreateTeamResult = { team: TeamEntry } | { error: string; status: number };

// Fallback for a team created without a color (e.g. through the
// cookie-authenticated route, which doesn't require one) -- keeps `color`
// always renderable without every consumer needing a null-check default.
const DEFAULT_TEAM_COLOR = "#64748b";
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Admin creates a team for any manager in their firm; a manager creates a
// team for themself only (rule 4 -- "manager can manage several teams").
export async function createTeam(
  actor: Actor,
  input: { name: string; managerId?: string; color?: string }
): Promise<CreateTeamResult> {
  if (actor.role !== "admin" && actor.role !== "manager") {
    return { error: "Only an admin or manager can create a team.", status: 403 };
  }
  if (!actor.firmId) {
    return { error: "Your account has no firm.", status: 400 };
  }

  const managerId = actor.role === "manager" ? actor.id : input.managerId;
  if (!managerId) {
    return { error: "Missing managerId.", status: 400 };
  }
  if (actor.role === "manager" && managerId !== actor.id) {
    return { error: "A manager can only create a team they manage themself.", status: 403 };
  }
  if (input.color && !HEX_COLOR_PATTERN.test(input.color)) {
    return { error: "Invalid color.", status: 400 };
  }

  if (actor.role === "admin") {
    const [manager] = await db
      .select({ id: users.id, role: users.role, firmId: users.firmId })
      .from(users)
      .where(and(eq(users.id, managerId), isNull(users.deletedAt)))
      .limit(1);
    if (!manager || manager.firmId !== actor.firmId || manager.role !== "manager") {
      return { error: "Select an existing manager in your firm.", status: 400 };
    }
  }

  const [team] = await db
    .insert(teams)
    .values({ firmId: actor.firmId, managerId, name: input.name, color: input.color ?? DEFAULT_TEAM_COLOR })
    .returning({ id: teams.id, name: teams.name, color: teams.color, managerId: teams.managerId, createdAt: teams.createdAt });

  // The manager is a member of their own team from the start -- managing a
  // team (teams.managerId) and belonging to one (teamMembers) are separate
  // relationships (see teamMembers' schema comment), and leaving this unset
  // made "Team membership" confusingly show empty for someone who plainly
  // manages the team.
  await db.insert(teamMembers).values({ teamId: team.id, userId: managerId });

  const [manager] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, managerId)).limit(1);

  return {
    team: {
      ...team,
      managerName: manager?.name ?? null,
      managerEmail: manager?.email ?? "",
      members: [{ id: managerId, name: manager?.name ?? null, email: manager?.email ?? "", role: "manager" }],
    },
  };
}

// Admin can manage any team in their firm; a manager only the team(s) they
// themself manage. Shared by updateTeam/deleteTeam -- editing/removing a
// team is scoped the same way creating one is (createTeam above).
function canManageTeam(actor: Actor, team: { firmId: string; managerId: string }): boolean {
  if (actor.firmId !== team.firmId) return false;
  if (actor.role === "admin") return true;
  return actor.role === "manager" && actor.id === team.managerId;
}

export type UpdateTeamResult = { team: TeamEntry } | { error: string; status: number };

// Same 3 fields createTeam accepts (name/color/managerId), all optional
// here since an edit may only touch one. Removing a member is a separate
// action -- see removeTeamMember below.
export async function updateTeam(
  actor: Actor,
  teamId: string,
  input: { name?: string; color?: string; managerId?: string }
): Promise<UpdateTeamResult> {
  const [existing] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!existing) {
    return { error: "Team not found.", status: 404 };
  }
  if (!canManageTeam(actor, existing)) {
    return { error: "You don't have permission to edit this team.", status: 403 };
  }
  if (input.color && !HEX_COLOR_PATTERN.test(input.color)) {
    return { error: "Invalid color.", status: 400 };
  }

  let managerId = existing.managerId;
  if (input.managerId && input.managerId !== existing.managerId) {
    // Reassigning a team's manager is admin-only -- a manager editing their
    // own team can rename/recolor it, but not hand it off to someone else.
    if (actor.role !== "admin") {
      return { error: "Only an admin can reassign a team's manager.", status: 403 };
    }
    const [manager] = await db
      .select({ id: users.id, role: users.role, firmId: users.firmId })
      .from(users)
      .where(and(eq(users.id, input.managerId), isNull(users.deletedAt)))
      .limit(1);
    if (!manager || manager.firmId !== actor.firmId || manager.role !== "manager") {
      return { error: "Select an existing manager in your firm.", status: 400 };
    }
    managerId = input.managerId;
  }

  const [updated] = await db
    .update(teams)
    .set({ name: input.name?.trim() || existing.name, color: input.color ?? existing.color, managerId })
    .where(eq(teams.id, teamId))
    .returning({ id: teams.id, name: teams.name, color: teams.color, managerId: teams.managerId, createdAt: teams.createdAt });

  // Same as createTeam: whoever manages a team is a member of it. Only
  // adds the new manager -- the old one's membership (if any) is left
  // alone, since removing people from a team isn't built yet.
  if (managerId !== existing.managerId) {
    await db.insert(teamMembers).values({ teamId, userId: managerId }).onConflictDoNothing();
  }

  const [manager] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, managerId)).limit(1);

  return { team: { ...updated, managerName: manager?.name ?? null, managerEmail: manager?.email ?? "", members: [] } };
}

export type DeleteTeamResult = { success: true } | { error: string; status: number };

// A team can only be deleted while empty -- deleting a non-empty team would
// silently strip everyone's team membership (and any manager-of-a-team-of-
// managers visibility riding on it, see permissions.ts's
// getManagerMemberUserIds) with no confirmation of who's affected.
export async function deleteTeam(actor: Actor, teamId: string): Promise<DeleteTeamResult> {
  const [existing] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!existing) {
    return { error: "Team not found.", status: 404 };
  }
  if (!canManageTeam(actor, existing)) {
    return { error: "You don't have permission to delete this team.", status: 403 };
  }

  // The manager's own membership row (added by createTeam/updateTeam)
  // doesn't count against "empty" -- it's always there by design, not
  // someone who needs to be removed first.
  const [anyOtherMember] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), ne(teamMembers.userId, existing.managerId), isNull(users.deletedAt)))
    .limit(1);
  if (anyOtherMember) {
    return { error: "Remove all members before deleting this team.", status: 400 };
  }

  await db.delete(teams).where(eq(teams.id, teamId));
  return { success: true };
}

export type AddTeamMemberResult = { success: true } | { error: string; status: number };

// Same permission scope as removeTeamMember. The target just needs to be
// an active user in the same firm -- onConflictDoNothing covers someone
// already on the team (e.g. a stale client re-submitting).
export async function addTeamMember(actor: Actor, teamId: string, userId: string): Promise<AddTeamMemberResult> {
  const [existing] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!existing) {
    return { error: "Team not found.", status: 404 };
  }
  if (!canManageTeam(actor, existing)) {
    return { error: "You don't have permission to add members to this team.", status: 403 };
  }

  const [target] = await db
    .select({ id: users.id, firmId: users.firmId })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!target || target.firmId !== existing.firmId) {
    return { error: "Select an existing user in your firm.", status: 400 };
  }

  await db.insert(teamMembers).values({ teamId, userId }).onConflictDoNothing();
  return { success: true };
}

export type RemoveTeamMemberResult = { success: true } | { error: string; status: number };

// Same permission scope as updateTeam/deleteTeam. The manager can't be
// removed through this path -- their teamMembers row is tied to being the
// manager (createTeam/updateTeam add it automatically); reassign the
// manager instead of removing them.
export async function removeTeamMember(actor: Actor, teamId: string, userId: string): Promise<RemoveTeamMemberResult> {
  const [existing] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!existing) {
    return { error: "Team not found.", status: 404 };
  }
  if (!canManageTeam(actor, existing)) {
    return { error: "You don't have permission to remove members from this team.", status: 403 };
  }
  if (userId === existing.managerId) {
    return { error: "Reassign the manager instead of removing them from the team.", status: 400 };
  }

  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return { success: true };
}

// Every team in the actor's firm -- team-level visibility (who manages
// what) is not member-scoped the way getMembers is; any firm member can see
// the firm's team list, same as an org chart.
export async function listTeams(actor: Actor): Promise<TeamEntry[]> {
  if (!actor.firmId) return [];

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, color: teams.color, managerId: teams.managerId, createdAt: teams.createdAt })
    .from(teams)
    .where(eq(teams.firmId, actor.firmId));
  if (teamRows.length === 0) return [];

  const teamIds = teamRows.map((t) => t.id);
  const managerIds = teamRows.map((t) => t.managerId);

  const [memberRows, managerRows] = await Promise.all([
    db
      .select({ teamId: teamMembers.teamId, id: users.id, name: users.name, email: users.email, role: users.role })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(inArray(teamMembers.teamId, teamIds), isNull(users.deletedAt))),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(inArray(users.id, managerIds), isNull(users.deletedAt))),
  ]);

  const membersByTeam = new Map<string, TeamMemberEntry[]>();
  for (const m of memberRows) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push({ id: m.id, name: m.name, email: m.email, role: m.role });
    membersByTeam.set(m.teamId, list);
  }
  const managerById = new Map(managerRows.map((m) => [m.id, m]));

  return teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color ?? DEFAULT_TEAM_COLOR,
    managerId: t.managerId,
    managerName: managerById.get(t.managerId)?.name ?? null,
    managerEmail: managerById.get(t.managerId)?.email ?? "",
    createdAt: t.createdAt,
    members: membersByTeam.get(t.id) ?? [],
  }));
}
