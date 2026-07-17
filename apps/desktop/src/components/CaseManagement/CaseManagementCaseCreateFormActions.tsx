import { Button } from "@/components/ui/button";

interface CaseManagementCaseCreateFormActionsProps {
  loading: boolean;
  onCancel: () => void;
}

export default function CaseManagementCaseCreateFormActions({
  loading,
  onCancel,
}: CaseManagementCaseCreateFormActionsProps) {
  return (
    <div className="flex justify-end gap-3 border-t border-border pt-4">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={loading}
        className="px-6 py-2.5 h-auto"
      >
        Cancel
      </Button>
      <Button type="submit" disabled={loading} className="px-6 py-2.5 h-auto">
        {loading ? "Creating..." : "Create Case"}
      </Button>
    </div>
  );
}
