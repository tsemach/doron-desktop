import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../ui/button";
import type { Role } from "@/lib/permissions";
import type { OrgMember } from "./SettingUsersRolesTable";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";
import { TEAM_COLORS } from "./SettingUsersRolesTeamCreateDialog";

interface SettingUsersRolesTeamEditDialogProps {
  role: Role;
  managers: OrgMember[];
  team: TeamEntry;
  onSave: (name: string, managerId: string | undefined, color: string) => Promise<void>;
  onCancel: () => void;
}

// Same modal shape as SettingUsersRolesTeamCreateDialog.tsx, prefilled with
// the team being edited. Member management (add/remove people from a team)
// is deliberately not here yet -- planned for a later pass.
export default function SettingUsersRolesTeamEditDialog({ role, managers, team, onSave, onCancel }: SettingUsersRolesTeamEditDialogProps) {
  // Same exclusion as SettingUsersRolesTeamPanel.tsx: the manager is a
  // member of their own team too (createTeam/updateTeam add that
  // automatically), but they're already the "Manager" field below.
  const otherMembers = team.members.filter((m) => m.id !== team.managerId);
  const [name, setName] = useState(team.name);
  const [managerId, setManagerId] = useState(managers.some((m) => m.id === team.managerId) ? team.managerId : managers[0]?.id ?? "");
  const [color, setColor] = useState(team.color ?? TEAM_COLORS[0]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Mirrors apps/backend/lib/org/teams.ts's updateTeam: reassigning a
  // team's manager is admin-only, same as who's allowed to pick one at all.
  const needsManagerPick = role === "admin";
  const canSubmit = name.trim().length > 0 && (!needsManagerPick || managerId.length > 0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      await onSave(name.trim(), needsManagerPick ? managerId : undefined, color);
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to save team");
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">Edit team</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            {needsManagerPick ? "Change who manages this team." : "Update this team's name or color."}
          </p>
        </div>

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground" htmlFor="team-edit-name">
            Team name
          </label>
          <input
            id="team-edit-name"
            type="text"
            placeholder="e.g. Litigation Team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            autoFocus
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">Color</label>
          <div className="flex flex-wrap gap-2">
            {TEAM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-7 rounded-full flex items-center justify-center cursor-pointer ring-offset-2 ring-offset-card transition-all ${
                  color === c ? "ring-2 ring-foreground" : ""
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
              >
                {color === c && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>

        {needsManagerPick && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="team-edit-manager">
              Manager
            </label>
            {managers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No managers yet — promote someone to manager from the Invite tab first.</p>
            ) : (
              <div className="relative">
                <select
                  id="team-edit-manager"
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground appearance-none cursor-pointer"
                >
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">Members</label>
          {otherMembers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-32 overflow-y-auto">
              {otherMembers.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground font-medium">{m.name || m.email}</span>
                  <span className="text-muted-foreground capitalize">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="min-w-[112px]" disabled={sending || !canSubmit}>
            {sending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
