import { X } from "lucide-react";

interface SettingUsersRolesHelpProps {
  onClose: () => void;
}

export default function SettingUsersRolesHelp({ onClose }: SettingUsersRolesHelpProps) {
  return (
    <div className="space-y-4 animate-fade-in relative">
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
            <li><strong>Admin</strong> — full access to everyone in the firm; can invite managers and users, change roles, and remove accounts.</li>
            <li><strong>Manager</strong> — can invite users into their own team(s), including a team made up of other managers.</li>
            <li><strong>User</strong> — a lawyer or attorney with no management access.</li>
          </ul>
          <p className="pt-1">
            A self-registered account belongs to no firm, but can add or join other self-registered accounts as peers.
          </p>
        </div>

        <div className="space-y-1.5 border-b border-border/60 pb-3">
          <p className="font-semibold text-foreground">How invitations work</p>
          <p>
            Inviting someone sends them an email with a link to set their own password. Their account doesn't exist until they accept
            it — nothing shows up in this list until then.
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">Who can do what</p>
          <p>
            An admin account can only be created by Ascurix staff, never from here. Role changes and removal are admin-only, and an
            admin can't remove their own account.
          </p>
        </div>
      </div>
    </div>
  );
}
