import { Button } from "@/components/ui/button";
import VoiceFieldFiller from "@/components/ui/VoiceFieldFiller";

interface CaseManagementCaseCreateTemplateFieldsHeaderProps {
  activeTemplateName: string | undefined;
  associatedDocsCount: number;
  onShowAllPreview: () => void;
  templateFields: string[];
  onFieldExtracted: (field: string, value: string) => void;
}

export default function CaseManagementCaseCreateTemplateFieldsHeader({
  activeTemplateName,
  associatedDocsCount,
  onShowAllPreview,
  templateFields,
  onFieldExtracted,
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
      <div className="flex items-center gap-2 shrink-0">
        <VoiceFieldFiller availableFields={templateFields} onFieldExtracted={onFieldExtracted} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={associatedDocsCount === 0}
          onClick={onShowAllPreview}
        >
          Show all preview
        </Button>
      </div>
    </div>
  );
}
