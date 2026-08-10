import { useState } from "react";
import { RefreshCw, Search, UserPlus, X } from "lucide-react";
import type { Role } from "@/lib/permissions";
import SettingUsersRolesTable, { type OrgMember } from "./SettingUsersRolesTable";
import SettingUsersRolesInviteDialog from "./SettingUsersRolesInviteDialog";
import SettingUsersRolesMemberDetailModal from "./SettingUsersRolesMemberDetailModal";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";

interface SettingUsersRolesInvitePanelProps {
  members: OrgMember[];
  loading: boolean;
  error: string;
  currentUserId?: string;
  canManage: boolean;
  canInvite: boolean;
  invitableRoles: Role[];
  busyUserId: string | null;
  showInvite: boolean;
  onShowInvite: () => void;
  onCancelInvite: () => void;
  onInvite: (email: string, role: Role, teamId?: string) => Promise<void>;
  onRoleChange: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
  role: Role;
  teams: TeamEntry[];
  onRefresh: () => void;
}

export default function SettingUsersRolesInvitePanel({
  members,
  loading,
  error,
  currentUserId,
  canManage,
  canInvite,
  invitableRoles,
  busyUserId,
  showInvite,
  onShowInvite,
  onCancelInvite,
  onInvite,
  onRoleChange,
  onRemove,
  role,
  teams,
  onRefresh,
}: SettingUsersRolesInvitePanelProps) {
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const query = search.trim().toLowerCase();
  const filteredMembers = query
    ? members.filter((m) => m.name?.toLowerCase().includes(query) || m.email.toLowerCase().includes(query))
    : members;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-1/2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-md border border-input bg-background pl-8 pr-7 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              title="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
      )}

      {/* max-height (not flex-1) so this caps independently of whether the
          ancestor chain's height actually resolves -- flex-1 percentage
          cascades through several nested levels turned out to be unreliable
          in practice, leaving the Invite button pushed off-screen with no
          scrollbar at all. */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : filteredMembers.length === 0 && query ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No matches for "{search.trim()}".</p>
        ) : (
          <SettingUsersRolesTable
            members={filteredMembers}
            currentUserId={currentUserId}
            canManage={canManage}
            busyUserId={busyUserId}
            onRoleChange={onRoleChange}
            onRemove={onRemove}
            onSelectMember={setSelectedMember}
          />
        )}
      </div>

      {canInvite && (
        <div className="shrink-0 border-t border-border/60 pt-4 flex justify-end">
          <button
            type="button"
            onClick={onShowInvite}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-all cursor-pointer shadow-md shadow-neutral-950/10 dark:shadow-none"
          >
            <UserPlus className="size-4" />
            Invite {invitableRoles.length === 1 && invitableRoles[0] !== "flat" ? invitableRoles[0] : "member"}
          </button>
        </div>
      )}

      {showInvite && (
        <SettingUsersRolesInviteDialog
          invitableRoles={invitableRoles}
          role={role}
          teams={teams}
          onInvite={onInvite}
          onCancel={onCancelInvite}
        />
      )}

      {selectedMember && <SettingUsersRolesMemberDetailModal member={selectedMember} teams={teams} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}
