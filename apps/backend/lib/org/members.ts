import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../database";
import { users } from "../../database/schema";
import { canChangeRole, canDelete, getVisibleMemberUserIds, type Actor, type Role } from "../permissions";

export interface MemberEntry {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  createdAt: Date;
}

// Rules 5-7 -- the member list only (name/email/role), never case/document
// data. See docs/identity-and-roles/design.md's non-goals.
export async function getMembers(actor: Actor): Promise<MemberEntry[]> {
  const visibleIds = await getVisibleMemberUserIds(actor);
  if (visibleIds.length === 0) return [];

  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(and(inArray(users.id, visibleIds), isNull(users.deletedAt)));
}

export type ChangeRoleResult = { user: { id: string; role: Role } } | { error: string; status: number };

// Rule 11 -- admin only, manager<->user only, same firm. See permissions.ts's canChangeRole.
export async function changeUserRole(actor: Actor, targetUserId: string, newRole: Role): Promise<ChangeRoleResult> {
  if (newRole !== "manager" && newRole !== "user") {
    return { error: "Role can only be changed to 'manager' or 'user'.", status: 400 };
  }

  const [target] = await db
    .select({ id: users.id, role: users.role, firmId: users.firmId })
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1);
  if (!target) {
    return { error: "User not found.", status: 404 };
  }

  if (!canChangeRole(actor, target)) {
    return { error: "You don't have permission to change this user's role.", status: 403 };
  }

  const [updated] = await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId))
    .returning({ id: users.id, role: users.role });

  return { user: updated };
}

export type DeleteUserResult = { success: true } | { error: string; status: number };

// Rule 12 -- admin only, same firm, soft delete only (never a hard delete).
export async function softDeleteUser(actor: Actor, targetUserId: string): Promise<DeleteUserResult> {
  const [target] = await db
    .select({ id: users.id, role: users.role, firmId: users.firmId })
    .from(users)
    .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
    .limit(1);
  if (!target) {
    return { error: "User not found.", status: 404 };
  }

  if (!canDelete(actor, target)) {
    return { error: "You don't have permission to delete this user.", status: 403 };
  }

  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, targetUserId));
  return { success: true };
}
