import { useEffect } from "react";
import { Button } from "../ui/button";
import type { OrgMember } from "./SettingUsersRolesTable";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";

interface SettingUsersRolesMemberDetailModalProps {
  member: OrgMember;
  teams: TeamEntry[];
  onClose: () => void;
}

// Read-only info modal, opened by clicking a name in SettingUsersRolesTable.
// Both "manages" and "member of" are derived client-side from the
// already-loaded `teams` list (same data the Team tab renders) -- no
// separate fetch needed, and it doubles as the answer to "who's my
// manager": whoever manages a team this person belongs to.
export default function SettingUsersRolesMemberDetailModal({ member, teams, onClose }: SettingUsersRolesMemberDetailModalProps) {
  const managedTeams = teams.filter((t) => t.managerId === member.id);
  // Excludes teams they manage themself -- being a member of your own team
  // (createTeam/updateTeam add that automatically) doesn't answer "who's
  // my manager", it would just show them managed by themself.
  const memberOfTeams = teams.filter((t) => t.managerId !== member.id && t.members.some((m) => m.id === member.id));

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-foreground">{member.name || member.email}</h3>
            {member.role !== "flat" && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                {member.role}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>

        {managedTeams.length > 0 && (
          <div className="space-y-3 border-t border-border/60 pt-3">
            <p className="text-xs font-semibold text-foreground">Manages</p>
            {managedTeams.map((t) => {
              // Same exclusion as SettingUsersRolesTeamPanel.tsx: the
              // manager is a member of their own team too, but they're
              // already the heading here, so leave them out of the list.
              const teamMembers = t.members.filter((m) => m.id !== t.managerId);
              return (
                <div key={t.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: t.color || "#64748b" }} />
                    {t.name}
                  </div>
                  {teamMembers.length > 0 && (
                    <ul className="space-y-1.5 pl-4">
                      {teamMembers.map((m) => (
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

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-xs font-semibold text-foreground">Team membership</p>
          {memberOfTeams.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not part of any team yet.</p>
          ) : (
            <ul className="space-y-2">
              {memberOfTeams.map((t) => (
                <li key={t.id} className="text-xs">
                  <div className="flex items-center gap-2 text-foreground font-medium">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: t.color || "#64748b" }} />
                    {t.name}
                  </div>
                  <p className="text-muted-foreground pl-4">Managed by {t.managerName || t.managerEmail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
