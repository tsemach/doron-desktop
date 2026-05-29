import { TemplateRow } from "./DocsManagementTemplates.types";

interface DocsManagementTemplatesListItemProps {
  template: TemplateRow;
  isSelected: boolean;
  onClick: () => void;
}

function fieldCount(fieldsJson: string): number {
  try {
    const arr = JSON.parse(fieldsJson);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function DocsManagementTemplatesListItem({
  template,
  isSelected,
  onClick,
}: DocsManagementTemplatesListItemProps) {
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/50 bg-background hover:bg-muted/40 hover:border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <span className="font-mono text-xs font-semibold truncate text-foreground flex-1">
          {template.file_name}
        </span>
        <span className="shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
          {template.file_ext}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(template.uploaded_at)}</span>
        <span className="font-medium bg-muted/80 px-1.5 py-0.5 rounded text-foreground/80">
          {fieldCount(template.fields_found)} variables
        </span>
      </div>
    </div>
  );
}
