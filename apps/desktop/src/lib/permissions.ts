import { useAtomValue } from "jotai";
import { sessionAtom } from "@/store/authStore";

// ASC-142 -- not tier-gated (see featureGating.ts for that pattern); every
// role is available on every subscription tier. This just reads the
// session's role/firm_id, mirroring featureGating.ts's
// useAtomValue(sessionAtom) shape.
export type Role = "admin" | "manager" | "user" | "flat";

const KNOWN_ROLES: Role[] = ["admin", "manager", "user", "flat"];

// Defaults to "flat" for a signed-out or not-yet-loaded session, same
// fallback the backend schema itself uses -- never silently grants a
// privileged role when the session can't be read.
export function useUserRole(): Role {
  const session = useAtomValue(sessionAtom);
  const role = session?.role;
  return role && (KNOWN_ROLES as string[]).includes(role) ? (role as Role) : "flat";
}

export function useIsAdmin(): boolean {
  return useUserRole() === "admin";
}

// Rule 11/12 -- role changes and removal are admin-only (see
// docs/identity-and-roles/design.md); used to gate the Settings roster
// table's per-row actions. Kept distinct from useCanInvite below, since
// invite rights extend to manager and flat too, with narrower targets.
export function useCanManageUsers(): boolean {
  return useIsAdmin();
}

// Rules 1/3/13 -- admin invites manager|user, manager invites user, flat
// invites flat (a narrower peer-group "add/join", not general roster
// management). Plain "user" role cannot invite anyone. Mirrors
// apps/backend/lib/permissions.ts's canInvite.
export function useInvitableRoles(): Role[] {
  const role = useUserRole();
  if (role === "admin") return ["manager", "user"];
  if (role === "manager") return ["user"];
  if (role === "flat") return ["flat"];
  return [];
}

export function useCanInvite(): boolean {
  return useInvitableRoles().length > 0;
}
