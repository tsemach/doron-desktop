import { eq } from "drizzle-orm";
import { db } from "../../database";
import { teams } from "../../database/schema";
import type { Actor } from "../permissions";

export interface TeamEntry {
  id: string;
  name: string;
  managerId: string;
  createdAt: Date;
}

export type CreateTeamResult = { team: TeamEntry } | { error: string; status: number };

// Admin creates a team for any manager in their firm; a manager creates a
// team for themself only (rule 4 -- "manager can manage several teams").
export async function createTeam(actor: Actor, input: { name: string; managerId?: string }): Promise<CreateTeamResult> {
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

  const [team] = await db
    .insert(teams)
    .values({ firmId: actor.firmId, managerId, name: input.name })
    .returning({ id: teams.id, name: teams.name, managerId: teams.managerId, createdAt: teams.createdAt });

  return { team };
}

// Every team in the actor's firm -- team-level visibility (who manages
// what) is not member-scoped the way getMembers is; any firm member can see
// the firm's team list, same as an org chart.
export async function listTeams(actor: Actor): Promise<TeamEntry[]> {
  if (!actor.firmId) return [];

  return db
    .select({ id: teams.id, name: teams.name, managerId: teams.managerId, createdAt: teams.createdAt })
    .from(teams)
    .where(eq(teams.firmId, actor.firmId));
}
