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
        className="px-5 py-1.5 h-[36px]"
      >
        Cancel
      </Button>
      <Button type="submit" disabled={loading} className="px-5 py-1.5 h-[36px]">
        {loading ? "Creating..." : "Create Case"}
      </Button>
    </div>
  );
}
