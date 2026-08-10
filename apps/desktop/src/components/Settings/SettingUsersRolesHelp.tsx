import { X } from "lucide-react";

interface SettingUsersRolesHelpProps {
  onClose: () => void;
}

export default function SettingUsersRolesHelp({ onClose }: SettingUsersRolesHelpProps) {
  return (
    <div className="space-y-4 animate-fade-in relative max-h-[70vh] overflow-y-auto pr-1">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Close help"
      >
        <X className="size-4" />
      </button>

      <h3 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5 pt-0.5 border-b border-border/60 pb-2">
        Users and Roles
      </h3>

      <div className="text-xs text-muted-foreground space-y-3.5 leading-relaxed">
        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">Roles</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Admin</strong> — full access to everyone in the firm; can invite managers and users, change roles, remove accounts, and manage every team.</li>
            <li><strong>Manager</strong> — invites users into their own team(s), and manages the team(s) they own. Can also belong to another manager's team, so a manager can report to another manager.</li>
            <li><strong>User</strong> — a lawyer or attorney with no management access.</li>
          </ul>
          <p className="pt-1">
            A self-registered account belongs to no firm, but can add or join other self-registered accounts as peers.
          </p>
        </div>

        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">Teams</p>
          <p>
            A team is a group of people with exactly one manager. Every team in the firm is visible to everyone here — like an org
            chart — even people who aren't on it.
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Creating a team means picking who manages it: an admin picks any existing manager; a manager creating a team always manages it themself.</li>
            <li>A team's manager is automatically counted as one of its members.</li>
            <li>Someone can belong to more than one team — e.g. a manager who also reports to another manager's team.</li>
            <li>The "Managed by" name on a team is who to ask about that team; the manager shown in a person's own details is whoever manages a team they belong to.</li>
          </ul>
        </div>

        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">How invitations work</p>
          <p>
            Inviting someone sends them an email with a link to set their own password. Their account doesn't exist until they accept
            it — nothing shows up in this list until then. An admin inviting a user (not a manager) also picks which team the invite
            joins; a manager's invites always join their own team automatically.
          </p>
        </div>

        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">What you can do with a user</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Click a name in the list to see their role, what team(s) they manage, and what team(s) they belong to.</li>
            <li>Change someone's role between manager and user (admin only) — never to or from admin, which only Ascurix staff can set.</li>
            <li>Remove someone's account (admin only). If they still manage or belong to a team, remove them from it (or reassign the team's manager) first — this is blocked otherwise.</li>
          </ul>
        </div>

        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">What you can do with a team</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Create a team, with a name and color (admin picks the manager; a manager always manages their own).</li>
            <li>Edit a team's name, color, or manager (only an admin can reassign the manager).</li>
            <li>Add or remove members — anyone in the firm not already on the team can be added; a team's own manager can't be removed this way.</li>
            <li>Delete a team, once every member besides its manager has been removed.</li>
          </ul>
        </div>

        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">Who can do what</p>
          <p>
            An admin account can only be created by Ascurix staff, never from here. Role changes and account removal are admin-only,
            and an admin can't remove their own account. For teams: an admin can create, edit, or delete any team in the firm; a
            manager can only do so for team(s) they themself manage.
          </p>
        </div>
      </div>
    </div>
  );
}
