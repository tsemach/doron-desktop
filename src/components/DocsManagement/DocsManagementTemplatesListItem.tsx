import { invoke } from "@tauri-apps/api/core";
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
  const handleOpenDoc = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke("open_template_file", { path: template.marked_path });
    } catch (err) {
      console.error("Failed to open template document:", err);
    }
  };

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
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold truncate text-foreground block" title={template.title || template.file_name}>
            {template.title || template.file_name}
          </span>
          {template.title && (
            <span className="font-mono text-[10px] text-muted-foreground truncate block mt-0.5" title={template.file_name}>
              {template.file_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleOpenDoc}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Open in default application (e.g. Word, PDF viewer)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <span className="shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
            {template.file_ext}
          </span>
        </div>
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
