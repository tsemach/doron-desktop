import { Loader2, Trash2 } from "lucide-react";

export interface OrgMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface SettingUsersRolesTableProps {
  members: OrgMember[];
  currentUserId?: string;
  canManage: boolean;
  busyUserId: string | null;
  onRoleChange: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
  onSelectMember: (member: OrgMember) => void;
}

// Rule 11 -- only manager/user roles are ever changeable (never admin/flat),
// mirroring apps/backend/lib/permissions.ts's canChangeRole. The server
// re-validates regardless; this only decides what to render.
const CHANGEABLE_ROLES = ["manager", "user"];

export default function SettingUsersRolesTable({
  members,
  currentUserId,
  canManage,
  busyUserId,
  onRoleChange,
  onRemove,
  onSelectMember,
}: SettingUsersRolesTableProps) {
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No one to show yet.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border/60">
            <th className="py-2 px-2 font-medium">Name</th>
            <th className="py-2 px-2 font-medium">Email</th>
            <th className="py-2 px-2 font-medium">Role</th>
            {canManage && <th className="py-2 px-2 font-medium text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            const isBusy = busyUserId === member.id;
            const canChangeThisRole = canManage && !isSelf && CHANGEABLE_ROLES.includes(member.role);
            const canRemoveThisMember = canManage && !isSelf;

            return (
              <tr key={member.id} className="border-b border-border/40 last:border-0">
                <td className="py-2.5 px-2 font-medium">
                  <button
                    type="button"
                    onClick={() => onSelectMember(member)}
                    className="text-foreground hover:text-primary hover:underline cursor-pointer"
                  >
                    {member.name || "—"}
                  </button>
                  {isSelf && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>}
                </td>
                <td className="py-2.5 px-2 text-muted-foreground">{member.email}</td>
                {/* "flat" is an internal term, never shown as a label. */}
                <td className="py-2.5 px-2 capitalize text-foreground">{member.role === "flat" ? "—" : member.role}</td>
                {canManage && (
                  <td className="py-2.5 px-2">
                    <div className="flex items-center justify-end gap-2">
                      {canChangeThisRole && (
                        <div className="relative">
                          <select
                            value={member.role}
                            disabled={isBusy}
                            onChange={(e) => onRoleChange(member.id, e.target.value)}
                            className="text-xs border border-input bg-background rounded-lg pl-2 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 appearance-none cursor-pointer"
                          >
                            <option value="manager">manager</option>
                            <option value="user">user</option>
                          </select>
                          <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none text-muted-foreground">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </div>
                        </div>
                      )}
                      {canRemoveThisMember && (
                        <button
                          type="button"
                          onClick={() => onRemove(member.id)}
                          disabled={isBusy}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded hover:bg-destructive/10 cursor-pointer disabled:opacity-50"
                          title="Remove"
                        >
                          {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
