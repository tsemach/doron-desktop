import { Button } from "@/components/ui/button";

interface CaseManagementCaseCreateTemplateFieldsHeaderProps {
  activeTemplateName: string | undefined;
  associatedDocsCount: number;
  onShowAllPreview: () => void;
}

export default function CaseManagementCaseCreateTemplateFieldsHeader({
  activeTemplateName,
  associatedDocsCount,
  onShowAllPreview,
}: CaseManagementCaseCreateTemplateFieldsHeaderProps) {
  return (
    <div className="shrink-0 flex items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Template Fields ({activeTemplateName})
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter real values for the template variables. Unfilled fields will remain as placeholders.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={associatedDocsCount === 0}
        onClick={onShowAllPreview}
        className="shrink-0"
      >
        Show all preview
      </Button>
    </div>
  );
}
