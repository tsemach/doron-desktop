import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Pencil, PlusCircle, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useCanCreateTeam, type Role } from "@/lib/permissions";
import type { OrgMember } from "./SettingUsersRolesTable";
import SettingUsersRolesTeamCreateDialog from "./SettingUsersRolesTeamCreateDialog";
import SettingUsersRolesTeamEditDialog from "./SettingUsersRolesTeamEditDialog";

export interface TeamMemberEntry {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface TeamEntry {
  id: string;
  name: string;
  color: string | null;
  managerId: string;
  managerName: string | null;
  managerEmail: string;
  createdAt: string;
  members: TeamMemberEntry[];
}

interface SettingUsersRolesTeamPanelProps {
  members: OrgMember[];
  role: Role;
  currentUserId?: string;
  teams: TeamEntry[];
  loading: boolean;
  error: string;
  onRefresh: () => Promise<void>;
}

// ASC-142 -- team-level visibility is firm-wide for every role, same as an
// org chart (see apps/backend/lib/org/teams.ts's listTeams comment); only
// team *creation* is gated below via useCanCreateTeam. `teams` is fetched
// by the parent (SettingUsersRoles.tsx) so the Invite dialog's admin-only
// team picker can share the same data.
export default function SettingUsersRolesTeamPanel({
  members,
  role,
  currentUserId,
  teams,
  loading,
  error,
  onRefresh,
}: SettingUsersRolesTeamPanelProps) {
  const canCreateTeam = useCanCreateTeam();
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamEntry | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const filteredTeams = query ? teams.filter((t) => t.name.toLowerCase().includes(query)) : teams;

  async function handleCreate(name: string, managerId: string | undefined, color: string) {
    await invoke("create_team", { name, managerId, color });
    setShowCreate(false);
    await onRefresh();
  }

  async function handleUpdate(name: string, managerId: string | undefined, color: string) {
    if (!editingTeam) return;
    await invoke("update_team", { teamId: editingTeam.id, name, managerId, color });
    setEditingTeam(null);
    await onRefresh();
  }

  async function handleDelete(team: TeamEntry) {
    if (!window.confirm(`Delete "${team.name}"? This can't be undone.`)) return;
    setDeleteError("");
    setBusyTeamId(team.id);
    try {
      await invoke("delete_team", { teamId: team.id });
      await onRefresh();
    } catch (err: any) {
      setDeleteError(err?.message || String(err) || "Failed to delete team.");
    } finally {
      setBusyTeamId(null);
    }
  }

  // A manager can edit/delete only the team(s) they themself manage; an
  // admin can manage any team in the firm -- mirrors canManageTeam in
  // apps/backend/lib/org/teams.ts.
  function canManageTeam(team: TeamEntry) {
    if (role === "admin") return true;
    return role === "manager" && team.managerId === currentUserId;
  }

  // Admin's manager picker in the create/edit dialogs only offers users who
  // already hold role "manager" -- mirrors createTeam's server-side check.
  const managers = members.filter((m) => m.role === "manager");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative w-1/2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams…"
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

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      {deleteError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{deleteError}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : filteredTeams.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {query ? `No matches for "${search.trim()}".` : "No teams yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredTeams.map((team) => {
            const isBusy = busyTeamId === team.id;
            const canManage = canManageTeam(team);
            const canDelete = canManage && team.members.length === 0;

            return (
              <div key={team.id} className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color || "#64748b" }} />
                    {team.name}
                  </h4>
                  <div className="flex items-center gap-3">
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingTeam(team)}
                          disabled={isBusy}
                          title="Edit team"
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(team)}
                          disabled={isBusy || !canDelete}
                          title={canDelete ? "Delete team" : "Remove all members before deleting this team"}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground text-right">
                      Managed by <span className="font-semibold text-foreground">{team.managerName || team.managerEmail}</span>
                    </span>
                  </div>
                </div>
                {team.members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No members yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {team.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{m.name || m.email}</span>
                        <span className="text-muted-foreground capitalize">{m.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canCreateTeam && (
        <div className="border-t border-border/60 pt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-all cursor-pointer shadow-md shadow-neutral-950/10 dark:shadow-none"
          >
            <PlusCircle className="size-4" />
            Create team
          </button>
        </div>
      )}

      {showCreate && (
        <SettingUsersRolesTeamCreateDialog role={role} managers={managers} onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
      )}

      {editingTeam && (
        <SettingUsersRolesTeamEditDialog
          role={role}
          managers={managers}
          team={editingTeam}
          onSave={handleUpdate}
          onCancel={() => setEditingTeam(null)}
        />
      )}
    </div>
  );
}
