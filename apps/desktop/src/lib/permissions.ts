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

// Rules 1/3 -- admin and manager are the only roles that can invite/manage
// other accounts (a flat user's "add/join" is a narrower, separate action,
// not general member management -- see docs/identity-and-roles/design.md).
export function useCanManageUsers(): boolean {
  const role = useUserRole();
  return role === "admin" || role === "manager";
}
