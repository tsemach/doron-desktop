import { Button } from "@/components/ui/button";

interface OpenCasesCaseAnnotationsFooterProps {
  showClearAll: boolean;
  isSaving: boolean;
  onClearAll: () => void;
  onCancel: () => void;
}

export default function OpenCasesCaseAnnotationsFooter({
  showClearAll,
  isSaving,
  onClearAll,
  onCancel,
}: OpenCasesCaseAnnotationsFooterProps) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-4 mt-auto shrink-0 select-none">
      <div>
        {showClearAll && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onClearAll}
            disabled={isSaving}
          >
            Clear All
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Annotations"}
        </Button>
      </div>
    </div>
  );
}
