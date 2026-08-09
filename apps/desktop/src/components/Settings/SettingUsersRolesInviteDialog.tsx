import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import type { Role } from "@/lib/permissions";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";
import SettingUsersRolesTeamSelect from "./SettingUsersRolesTeamSelect";

interface SettingUsersRolesInviteDialogProps {
  invitableRoles: Role[];
  role: Role;
  teams: TeamEntry[];
  onInvite: (email: string, role: Role, teamId?: string) => Promise<void>;
  onCancel: () => void;
}

// Same modal shape as DocsManagement/TemplateTitlePromptModal.tsx -- the
// existing precedent for a small form-in-a-modal in this app.
export default function SettingUsersRolesInviteDialog({ invitableRoles, role, teams, onInvite, onCancel }: SettingUsersRolesInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [targetRole, setTargetRole] = useState<Role>(invitableRoles[0]);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // A manager always invites into their own team -- the backend derives it
  // automatically (apps/backend/lib/org/invitations.ts), no picker needed.
  // An admin invites across the firm, so they must say which team -- but
  // only for a "user" invite. A "manager" invite is exempt: a firm's first
  // manager can't exist yet when zero teams do (a team requires a manager
  // to create), so requiring one here would be a chicken-and-egg deadlock.
  const needsTeamPick = role === "admin" && targetRole === "user";
  const canSubmit = email.trim().length > 0 && (!needsTeamPick || teamId.length > 0);

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
      await onInvite(email.trim(), targetRole, needsTeamPick ? teamId : undefined);
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to send invitation");
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
          <h3 className="text-lg font-bold text-foreground">Invite member</h3>
          <p className="text-xs text-muted-foreground leading-normal">They'll get an email with a link to set up their account.</p>
        </div>

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground" htmlFor="invite-email">
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            autoFocus
            required
          />
        </div>

        {invitableRoles.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="invite-role">
              Role
            </label>
            <div className="relative">
              <select
                id="invite-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as Role)}
                className="w-full rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm capitalize focus:outline-none focus:ring-1 focus:ring-ring text-foreground appearance-none cursor-pointer"
              >
                {invitableRoles.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {needsTeamPick && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="invite-team">
              Team
            </label>
            {teams.length === 0 ? (
              <p className="text-xs text-muted-foreground">No teams yet — create one from the Team tab first.</p>
            ) : (
              <SettingUsersRolesTeamSelect id="invite-team" teams={teams} value={teamId} onChange={setTeamId} />
            )}
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="min-w-[112px]" disabled={sending || !canSubmit}>
            {sending ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </div>
  );
}
