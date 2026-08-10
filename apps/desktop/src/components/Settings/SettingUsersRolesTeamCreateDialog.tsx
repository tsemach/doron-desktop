import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../ui/button";
import type { Role } from "@/lib/permissions";
import type { OrgMember } from "./SettingUsersRolesTable";

// Fixed swatch palette -- no free-form color input, matching the fixed-
// palette badge pattern already used for task statuses
// (apps/desktop/src/lib/task/statusColors.ts), just user-selectable here.
export const TEAM_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // amber
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

interface SettingUsersRolesTeamCreateDialogProps {
  role: Role;
  managers: OrgMember[];
  onCreate: (name: string, managerId: string | undefined, color: string) => Promise<void>;
  onCancel: () => void;
}

// Same modal shape as SettingUsersRolesInviteDialog.tsx.
export default function SettingUsersRolesTeamCreateDialog({ role, managers, onCreate, onCancel }: SettingUsersRolesTeamCreateDialogProps) {
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState(managers[0]?.id ?? "");
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Mirrors apps/backend/lib/org/teams.ts's createTeam: a manager creating a
  // team is always its manager (forced server-side); only an admin picks one.
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
      await onCreate(name.trim(), needsManagerPick ? managerId : undefined, color);
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to create team");
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
          <h3 className="text-lg font-bold text-foreground">Create a team</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            {needsManagerPick ? "Pick who will manage this team." : "You'll manage this team."}
          </p>
        </div>

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground" htmlFor="team-name">
            Team name
          </label>
          <input
            id="team-name"
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
            <label className="text-xs font-semibold text-foreground" htmlFor="team-manager">
              Manager
            </label>
            {managers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No managers yet — promote someone to manager from the Invite tab first.</p>
            ) : (
              <div className="relative">
                <select
                  id="team-manager"
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

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="min-w-[112px]" disabled={sending || !canSubmit}>
            {sending ? "Creating…" : "Create team"}
          </Button>
        </div>
      </form>
    </div>
  );
}
