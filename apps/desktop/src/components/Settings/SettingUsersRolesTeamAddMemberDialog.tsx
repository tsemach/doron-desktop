import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import type { OrgMember } from "./SettingUsersRolesTable";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";

interface SettingUsersRolesTeamAddMemberDialogProps {
  team: TeamEntry;
  eligibleMembers: OrgMember[];
  onAdd: (userId: string) => Promise<void>;
  onCancel: () => void;
}

// Same modal shape as SettingUsersRolesTeamCreateDialog.tsx.
export default function SettingUsersRolesTeamAddMemberDialog({ team, eligibleMembers, onAdd, onCancel }: SettingUsersRolesTeamAddMemberDialogProps) {
  const [userId, setUserId] = useState(eligibleMembers[0]?.id ?? "");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

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
      await onAdd(userId);
    } catch (err: any) {
      setError(err?.message || String(err) || "Failed to add member");
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
          <h3 className="text-lg font-bold text-foreground">Add member</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            Add someone to <span className="font-semibold text-foreground/90">{team.name}</span>.
          </p>
        </div>

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground" htmlFor="team-add-member">
            Person
          </label>
          {eligibleMembers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Everyone is already on this team.</p>
          ) : (
            <div className="relative">
              <select
                id="team-add-member"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground appearance-none cursor-pointer"
              >
                {eligibleMembers.map((m) => (
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

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="min-w-[112px]" disabled={sending || eligibleMembers.length === 0}>
            {sending ? "Adding…" : "Add member"}
          </Button>
        </div>
      </form>
    </div>
  );
}
