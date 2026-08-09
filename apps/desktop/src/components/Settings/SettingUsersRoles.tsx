import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import { HelpCircle, UserPlus, Users } from "lucide-react";
import { sessionAtom } from "@/store/authStore";
import { useCanInvite, useCanManageUsers, useInvitableRoles, useUserRole, type Role } from "@/lib/permissions";
import SettingUsersRolesTable, { type OrgMember } from "./SettingUsersRolesTable";
import SettingUsersRolesInviteDialog from "./SettingUsersRolesInviteDialog";

interface SettingUsersRolesProps {
  onToggleHelp: () => void;
  activeHelp: string | null;
}

// ASC-142 -- "Users and Roles" Settings tab. Data lives in apps/backend's
// Postgres, not the local SQLite settings DB, so this talks to the org
// Rust commands (src-tauri/src/org/mod.rs, token-in-body to
// /api/v1/org/desktop/**) rather than the usual get_*_settings/save_*_settings
// pattern the rest of Settings.tsx uses.
export default function SettingUsersRoles({ onToggleHelp, activeHelp }: SettingUsersRolesProps) {
  const session = useAtomValue(sessionAtom);
  const role = useUserRole();
  const canManage = useCanManageUsers();
  const canInvite = useCanInvite();
  const invitableRoles = useInvitableRoles();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const result = await invoke<OrgMember[]>("list_org_members");
      setMembers(result);
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to load your organization.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function handleInvite(email: string, inviteRole: Role) {
    await invoke("invite_org_member", { email, role: inviteRole });
    setShowInvite(false);
    await loadMembers();
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setError("");
    setBusyUserId(userId);
    try {
      await invoke("change_org_member_role", { userId, role: newRole });
      await loadMembers();
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to change role.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(userId: string) {
    if (!window.confirm("Remove this person? They'll immediately lose access.")) return;
    setError("");
    setBusyUserId(userId);
    try {
      await invoke("delete_org_member", { userId });
      await loadMembers();
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to remove.");
    } finally {
      setBusyUserId(null);
    }
  }

  // The session (authStore.ts's Session) only carries email, not a user id
  // -- matching by email against the fetched roster is the only way to know
  // which row is "you" without widening the session shape for this alone.
  const currentUserId = members.find((m) => m.email === session?.email)?.id;

  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
          <Users className="size-4 text-foreground" />
          Users and Roles
        </h2>
        <button
          type="button"
          onClick={onToggleHelp}
          className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 rounded hover:bg-muted ${
            activeHelp === "users_roles" ? "text-foreground bg-muted" : ""
          }`}
          title="About Users and Roles"
        >
          <HelpCircle className="size-4" />
        </button>
      </div>

      <div className="text-xs text-muted-foreground -mt-4">
        Signed in as <span className="font-semibold text-foreground">{session?.email}</span>
        {/* "flat" is an internal term (self-registered, no firm) -- never
            surfaced as a label anywhere in this UI, unlike admin/manager/user. */}
        {role !== "flat" && (
          <>
            , role <span className="font-semibold text-foreground capitalize">{role}</span>
          </>
        )}
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : (
        <SettingUsersRolesTable
          members={members}
          currentUserId={currentUserId}
          canManage={canManage}
          busyUserId={busyUserId}
          onRoleChange={handleRoleChange}
          onRemove={handleRemove}
        />
      )}

      {canInvite && (
        <div className="border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-all cursor-pointer shadow-md shadow-neutral-950/10 dark:shadow-none"
          >
            <UserPlus className="size-4" />
            Invite {invitableRoles.length === 1 && invitableRoles[0] !== "flat" ? invitableRoles[0] : "someone"}
          </button>
        </div>
      )}

      {showInvite && (
        <SettingUsersRolesInviteDialog invitableRoles={invitableRoles} onInvite={handleInvite} onCancel={() => setShowInvite(false)} />
      )}
    </div>
  );
}
