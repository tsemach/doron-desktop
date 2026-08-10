import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import { Building2, HelpCircle, UserPlus, Users } from "lucide-react";
import { sessionAtom } from "@/store/authStore";
import { useLanguage } from "@/context/LanguageContext";
import { useCanInvite, useCanManageUsers, useInvitableRoles, useUserRole, type Role } from "@/lib/permissions";
import SettingMenuTabItem from "./SettingMenuTabItem";
import SettingUsersRolesInvitePanel from "./SettingUsersRolesInvitePanel";
import SettingUsersRolesTeamPanel from "./SettingUsersRolesTeamPanel";
import SettingUsersRolesHelp from "./SettingUsersRolesHelp";
import SettingUsersRolesRemoveMemberModal from "./SettingUsersRolesRemoveMemberModal";
import SettingUsersRolesRemoveErrorModal from "./SettingUsersRolesRemoveErrorModal";
import type { OrgMember } from "./SettingUsersRolesTable";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";

type Section = "invite" | "team" | "help";

// ASC-142 -- "Users and Roles" Settings tab. Data lives in apps/backend's
// Postgres, not the local SQLite settings DB, so this talks to the org
// Rust commands (src-tauri/src/org/mod.rs, token-in-body to
// /api/v1/org/desktop/**) rather than the usual get_*_settings/save_*_settings
// pattern the rest of Settings.tsx uses. Help is a sidebar section here
// (not the shared activeHelp side-pane Settings.tsx uses for other tabs) --
// see Settings.tsx's "users_roles manages its own full-width layout" note.
export default function SettingUsersRoles() {
  const { t } = useLanguage();
  const session = useAtomValue(sessionAtom);
  const role = useUserRole();
  const canManage = useCanManageUsers();
  const canInvite = useCanInvite();
  const invitableRoles = useInvitableRoles();

  const [activeSection, setActiveSection] = useState<Section>("invite");
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [removeError, setRemoveError] = useState("");

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

  // Lifted here (not owned by SettingUsersRolesTeamPanel) so the Invite
  // dialog's admin-only team picker can share the same fetch instead of a
  // second one when both sections have been visited.
  async function loadTeams() {
    setTeamsLoading(true);
    setTeamsError("");
    try {
      const result = await invoke<TeamEntry[]>("list_teams");
      setTeams(result);
    } catch (err: any) {
      setTeamsError(err?.message || String(err) || "Failed to load teams.");
    } finally {
      setTeamsLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    loadTeams();
  }, []);

  async function handleInvite(email: string, inviteRole: Role, teamId?: string) {
    await invoke("invite_org_member", { email, role: inviteRole, teamId });
    setShowInvite(false);
    await loadMembers();
  }

  async function handleRoleChange(userId: string, newRole: string) {
    if (!window.confirm(`Change this person's role to "${newRole}"? This changes what they can access immediately.`)) {
      // The <select> is controlled by member.role, but the browser already
      // visually selected the new option before this handler ran. Since we're
      // not changing `members` state, force a re-render so React re-syncs
      // the select back to the unchanged role instead of leaving it stuck on
      // the option the user just backed out of.
      setMembers((prev) => [...prev]);
      return;
    }
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

  // Clicking the trash icon checks team membership up front (using the
  // already-loaded `teams` list, no extra round-trip) so someone who can't
  // be removed sees why immediately instead of typing a confirmation first
  // and only then hitting the backend's same check in confirmRemove.
  function openRemoveModal(userId: string) {
    const member = members.find((m) => m.id === userId);
    if (!member) return;

    const blockingTeams = teams.filter((t) => t.managerId === userId || t.members.some((m) => m.id === userId));
    if (blockingTeams.length > 0) {
      const names = blockingTeams.map((t) => t.name).join(", ");
      const noun = blockingTeams.length === 1 ? "a team" : "teams";
      const pronoun = blockingTeams.length === 1 ? "it" : "all of them";
      setRemoveError(`This person still belongs to ${noun}: ${names}. Remove them from ${pronoun} first.`);
      return;
    }

    setRemoveTarget(member);
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusyUserId(removeTarget.id);
    try {
      await invoke("delete_org_member", { userId: removeTarget.id });
      setRemoveTarget(null);
      await loadMembers();
    } catch (err: any) {
      // Closes the confirm modal and opens a dedicated error modal instead
      // of the inline banner -- most notably for the "still belongs to a
      // team" block from apps/backend/lib/org/members.ts's softDeleteUser,
      // which needs to be seen, not just a small red line under the table.
      setRemoveTarget(null);
      setRemoveError(err?.message || String(err) || "Failed to remove.");
    } finally {
      setBusyUserId(null);
    }
  }

  // The session (authStore.ts's Session) only carries email, not a user id
  // -- matching by email against the fetched roster is the only way to know
  // which row is "you" without widening the session shape for this alone.
  const currentUserId = members.find((m) => m.email === session?.email)?.id;

  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full h-full flex flex-col animate-fade-in">
      <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
        <Users className="size-4 text-foreground" />
        Users and Roles
      </h2>

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

      <div className="flex gap-3 flex-1 min-h-0">
        <div className="w-56 shrink-0 flex flex-col gap-1 border-r rtl:border-r-0 rtl:border-l border-border pr-4 rtl:pr-0 rtl:pl-4">
          <SettingMenuTabItem
            isActive={activeSection === "invite"}
            onClick={() => setActiveSection("invite")}
            icon={UserPlus}
            label="Invite"
          />
          <SettingMenuTabItem
            isActive={activeSection === "team"}
            onClick={() => setActiveSection("team")}
            icon={Building2}
            label={t("users_roles_teams")}
          />
          <SettingMenuTabItem
            isActive={activeSection === "help"}
            onClick={() => setActiveSection("help")}
            icon={HelpCircle}
            label="Help"
          />
        </div>

        <div className="flex-1 min-w-0">
          {activeSection === "invite" && (
            <SettingUsersRolesInvitePanel
              members={members}
              loading={loading}
              error={error}
              currentUserId={currentUserId}
              canManage={canManage}
              canInvite={canInvite}
              invitableRoles={invitableRoles}
              busyUserId={busyUserId}
              showInvite={showInvite}
              onShowInvite={() => setShowInvite(true)}
              onCancelInvite={() => setShowInvite(false)}
              onInvite={handleInvite}
              onRoleChange={handleRoleChange}
              onRemove={openRemoveModal}
              role={role}
              teams={teams}
              onRefresh={loadMembers}
            />
          )}
          {activeSection === "team" && (
            <SettingUsersRolesTeamPanel
              members={members}
              role={role}
              currentUserId={currentUserId}
              teams={teams}
              loading={teamsLoading}
              error={teamsError}
              onRefresh={loadTeams}
            />
          )}
          {activeSection === "help" && <SettingUsersRolesHelp onClose={() => setActiveSection("invite")} />}
        </div>
      </div>

      {removeTarget && (
        <SettingUsersRolesRemoveMemberModal
          member={removeTarget}
          removing={busyUserId === removeTarget.id}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {removeError && <SettingUsersRolesRemoveErrorModal message={removeError} onClose={() => setRemoveError("")} />}
    </div>
  );
}
