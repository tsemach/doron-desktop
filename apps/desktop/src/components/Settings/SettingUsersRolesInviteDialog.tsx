import { useState } from "react";
import { Button } from "../ui/button";
import type { Role } from "@/lib/permissions";

interface SettingUsersRolesInviteDialogProps {
  invitableRoles: Role[];
  onInvite: (email: string, role: Role) => Promise<void>;
  onCancel: () => void;
}

// Same modal shape as DocsManagement/TemplateTitlePromptModal.tsx -- the
// existing precedent for a small form-in-a-modal in this app.
export default function SettingUsersRolesInviteDialog({ invitableRoles, onInvite, onCancel }: SettingUsersRolesInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(invitableRoles[0]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      await onInvite(email.trim(), role);
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
          <h3 className="text-lg font-bold text-foreground">Invite someone</h3>
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
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              {invitableRoles.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={sending || !email.trim()}>
            {sending ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </div>
  );
}
