import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../../database";
import { firms, flatGroupMembers, flatGroups, invitations, teamMembers, teams, users } from "../../database/schema";
import { getEmailProvider } from "../email";
import { canInvite, type Actor, type Role } from "../permissions";

// Longer than lib/emailVerification.ts's 24h -- accepting an invitation
// requires the invitee to actually notice and act on an email someone else
// sent them, not just click through a signup they just initiated themselves.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateInvitationInput {
  email: string;
  role: Role;
  teamId?: string;
}

export type CreateInvitationResult = { invitation: { id: string; token: string } } | { error: string; status: number };

// Rules 1-3 -- admin/manager/flat inviting into their own firm/team/flat
// group. role="admin" is rejected by canInvite unconditionally: the only
// way to create one is apps/office's dedicated invite-admin flow (rule 2),
// which doesn't call this function at all.
export async function createInvitation(actor: Actor, input: CreateInvitationInput, origin: string): Promise<CreateInvitationResult> {
  if (!canInvite(actor, input.role)) {
    return { error: "You don't have permission to invite this role.", status: 403 };
  }

  if (input.role !== "flat" && !actor.firmId) {
    return { error: "Your account has no firm.", status: 400 };
  }

  // A manager always invites into their own team -- never a UI choice (see
  // SettingUsersRolesInviteDialog.tsx, which shows no team picker for a
  // manager actor). An admin must explicitly pick one instead, since they
  // could be targeting any team in the firm -- but only when inviting a
  // "user": a "manager" invite is exempt, since a firm's first manager
  // can't exist yet when zero teams do (a team requires a manager to
  // create), and a manager doesn't need to belong to a team to exist.
  let teamId = input.teamId;
  if (actor.role === "manager" && !teamId) {
    const [ownedTeam] = await db.select({ id: teams.id }).from(teams).where(eq(teams.managerId, actor.id)).limit(1);
    teamId = ownedTeam?.id;
  }
  if (actor.role === "admin" && input.role === "user" && !teamId) {
    return { error: "Select a team for this invitation.", status: 400 };
  }

  if (teamId) {
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (!team || team.firmId !== actor.firmId) {
      return { error: "Team not found.", status: 404 };
    }
    if (actor.role === "manager" && team.managerId !== actor.id) {
      return { error: "You can only invite into a team you manage.", status: 403 };
    }
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
    .limit(1);
  if (existingUser) {
    return { error: "A user with this email already exists.", status: 400 };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const [invitation] = await db
    .insert(invitations)
    .values({
      email: input.email,
      role: input.role,
      firmId: input.role === "flat" ? null : actor.firmId,
      teamId: teamId ?? null,
      invitedByUserId: actor.id,
      token,
      expiresAt,
    })
    .returning({ id: invitations.id, token: invitations.token });

  const acceptUrl = `${origin}/accept-invite?token=${token}`;
  await getEmailProvider().sendInvitationEmail(input.email, acceptUrl, input.role);

  return { invitation };
}

export type InvitationPreviewResult = { email: string; role: Role; firmName: string | null } | { error: string; status: number };

// Public (unauthenticated) -- backs the accept-invite web page's initial
// render, before the invitee has any account/session.
export async function getInvitationPreview(token: string): Promise<InvitationPreviewResult> {
  const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  const invalid = validateInvitationForUse(invitation);
  if (invalid) return invalid;

  let firmName: string | null = null;
  if (invitation!.firmId) {
    const [firm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, invitation!.firmId)).limit(1);
    firmName = firm?.name ?? null;
  }

  return { email: invitation!.email, role: invitation!.role, firmName };
}

export interface AcceptInvitationInput {
  fullName: string;
  password: string;
}

export type AcceptInvitationResult = { user: { id: string; email: string } } | { error: string; status: number };

// Public (unauthenticated) -- turns a pending invitation into a real
// `users` row. Sets emailVerified immediately: the invite email is itself
// proof of ownership, unlike self-service signup which needs a separate
// verification step (lib/emailVerification.ts).
export async function acceptInvitation(token: string, input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
  const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  const invalid = validateInvitationForUse(invitation);
  if (invalid) return invalid;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, invitation!.email), isNull(users.deletedAt)))
    .limit(1);
  if (existingUser) {
    return { error: "An account with this email already exists.", status: 400 };
  }

  const passwordHash = bcrypt.hashSync(input.password, bcrypt.genSaltSync(10));

  const [newUser] = await db
    .insert(users)
    .values({
      name: input.fullName,
      email: invitation!.email,
      passwordHash,
      role: invitation!.role,
      firmId: invitation!.role === "flat" ? null : invitation!.firmId,
      emailVerified: new Date(),
    })
    .returning({ id: users.id, email: users.email });

  if (invitation!.role === "flat") {
    await joinOrCreateFlatGroup(invitation!.invitedByUserId, newUser.id);
  } else if (invitation!.teamId) {
    await db.insert(teamMembers).values({ teamId: invitation!.teamId, userId: newUser.id });
  }

  // Marked accepted (not row-deleted, unlike consumeEmailVerification) so
  // who-invited-whom-when survives as an audit trail.
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invitation!.id));

  return { user: newUser };
}

function validateInvitationForUse(
  invitation: typeof invitations.$inferSelect | undefined
): { error: string; status: number } | null {
  if (!invitation) return { error: "This invitation link is invalid.", status: 404 };
  if (invitation.acceptedAt) return { error: "This invitation has already been used.", status: 400 };
  if (invitation.expiresAt.getTime() < Date.now()) return { error: "This invitation has expired.", status: 400 };
  return null;
}

// Rule 13 -- a flat user has no manager, only a peer group. The inviter's
// group is created on their first flat invite; the invitee joins it.
async function joinOrCreateFlatGroup(inviterUserId: string | null, newUserId: string): Promise<void> {
  if (!inviterUserId) return; // shouldn't happen -- flat invitations are always created by an existing flat user

  let [membership] = await db
    .select({ groupId: flatGroupMembers.groupId })
    .from(flatGroupMembers)
    .where(eq(flatGroupMembers.userId, inviterUserId))
    .limit(1);

  if (!membership) {
    const [group] = await db.insert(flatGroups).values({}).returning({ id: flatGroups.id });
    await db.insert(flatGroupMembers).values({ groupId: group.id, userId: inviterUserId });
    membership = { groupId: group.id };
  }

  await db.insert(flatGroupMembers).values({ groupId: membership.groupId, userId: newUserId });
}
