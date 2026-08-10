import { Button } from "../ui/button";

interface SettingUsersRolesRemoveErrorModalProps {
  message: React.ReactNode;
  onClose: () => void;
}

// Same modal shape as SettingUsersRolesRemoveMemberModal.tsx -- shown after
// a remove attempt fails, most notably when the person still belongs to a
// team (see softDeleteUser in apps/backend/lib/org/members.ts). There's no
// self-service "remove from team" flow yet, so this is informational only:
// it names the blocker and where to go, not an action itself.
export default function SettingUsersRolesRemoveErrorModal({ message, onClose }: SettingUsersRolesRemoveErrorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative w-[460px] p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">Couldn't remove this person</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <Button size="sm" onClick={onClose} className="text-xs px-4">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
