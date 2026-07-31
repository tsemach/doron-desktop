import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CaseManagementAddCompanyModalProps {
  /** Prefilled from whatever the user typed in the company field/tag input. */
  initialCompanyName: string;
  onConfirm: (companyName: string, billingMethod: string) => void;
  onCancel: () => void;
}

const BILLING_METHODS = ["Hourly", "Fixed Fee", "Retainer", "Not set"];

export default function CaseManagementAddCompanyModal({
  initialCompanyName,
  onConfirm,
  onCancel,
}: CaseManagementAddCompanyModalProps) {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [billingMethod, setBillingMethod] = useState(BILLING_METHODS[0]);

  function handleBillingMethodClick() {
    // Billing is tracked separately in AMI-91/AMI-121 and isn't implemented yet —
    // this is a placeholder until that feature lands.
    alert("Billing management is coming soon.");
  }

  function handleConfirm() {
    if (!companyName.trim()) return;
    onConfirm(companyName.trim(), billingMethod);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative w-[440px] p-6">
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-foreground leading-tight">Add New Company</h3>
          <p className="text-xs text-muted-foreground">
            This company doesn't exist yet. Add it so it can be reused across cases.
          </p>
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
          />
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Billing Method</label>
          <div className="flex gap-2">
            <select
              value={billingMethod}
              onChange={(e) => setBillingMethod(e.target.value)}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              {BILLING_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBillingMethodClick}
              className="text-xs px-3 border-border hover:bg-muted"
            >
              Manage Billing
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="text-xs px-4 border-border hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!companyName.trim()}
            className="text-xs px-4"
          >
            Add Company
          </Button>
        </div>
      </div>
    </div>
  );
}
