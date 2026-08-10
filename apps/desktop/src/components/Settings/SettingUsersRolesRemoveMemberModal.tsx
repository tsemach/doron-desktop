import { useState } from "react";
import { Button } from "../ui/button";
import type { OrgMember } from "./SettingUsersRolesTable";

interface SettingUsersRolesRemoveMemberModalProps {
  member: OrgMember;
  removing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Same modal shape as CaseManagement/OpenCasesCaseDeleteModal.tsx (this
// app's established destructive-confirm convention), extended with a
// type-to-confirm field -- removing an account is higher-stakes than the
// single-click confirms used elsewhere in this app (case/template deletes),
// since it revokes someone's access immediately.
export default function SettingUsersRolesRemoveMemberModal({ member, removing, onConfirm, onCancel }: SettingUsersRolesRemoveMemberModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const expected = member.name || member.email;
  const canConfirm = confirmText.trim() === expected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative w-[460px] p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0 text-red-600 dark:text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">Remove person</h3>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to remove <span className="font-semibold text-foreground/90">{expected}</span>? They'll immediately
              lose access.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="remove-confirm">
            Type <span className="font-mono text-foreground">{expected}</span> to confirm
          </label>
          <input
            id="remove-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={removing}
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground disabled:opacity-50"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={removing} className="text-xs px-4 border-border hover:bg-muted">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!canConfirm || removing}
            className="text-xs px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        </div>
      </div>
    </div>
  );
}
