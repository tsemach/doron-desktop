import { TemplateRow } from "./DocsManagementTemplates.types";
import { Button } from "../ui/button";

interface DocsManagementTemplatesFormProps {
  selectedTemplate: TemplateRow;
  fieldValues: Record<string, string>;
  setFieldValues: (values: Record<string, string>) => void;
  generating: boolean;
  genResult: { status: "ok" | "failed"; message: string } | null;
  onGenerate: () => void;
  onClearSelection: () => void;
  onSyncFields: () => void;
  onDelete: () => void;
}

export default function DocsManagementTemplatesForm({
  selectedTemplate,
  fieldValues,
  onClearSelection,
  onSyncFields,
  onDelete,
}: DocsManagementTemplatesFormProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header Details */}
      <div className="p-6 border-b border-border/60 bg-muted/10 shrink-0 flex items-center justify-between">
        <div className="space-y-1.5 min-w-0 flex-1 mr-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground truncate">
              {selectedTemplate.file_name}
            </h3>
            <span className="shrink-0 text-[10px] font-mono bg-muted border rounded-full px-2 py-0.5 text-muted-foreground uppercase">
              {selectedTemplate.file_ext}
            </span>
          </div>
          {selectedTemplate.title && (
            <p className="text-xs text-muted-foreground italic truncate" title={selectedTemplate.title}>
              Description: {selectedTemplate.title}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground truncate font-mono">
            Path: {selectedTemplate.original_path}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>

      {/* Variable viewer */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Template Variables
            </h4>
            <p className="text-xs text-muted-foreground">
              The following placeholder tags (e.g. `&lt;&lt;variable_name&gt;&gt;`) were identified in this document template. These tags will be automatically extracted and filled during document assembly.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncFields}
            className="flex items-center gap-1.5 shrink-0 bg-background"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Sync Fields
          </Button>
        </div>

        {Object.keys(fieldValues).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10">
            No placeholder tags (e.g. `[Variable]`) were identified in this document.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.keys(fieldValues).map((field) => (
              <div
                key={field}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 font-mono text-xs text-foreground/80 shadow-xs"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary/70 shrink-0"
                >
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                  <path d="M7 7h.01" />
                </svg>
                <span className="truncate font-semibold" title={field}>
                  {field}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="p-4 border-t border-border bg-muted/10 shrink-0 flex items-center justify-between">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          Delete Template
        </Button>
        <Button size="sm" onClick={onClearSelection}>
          Close
        </Button>
      </div>
    </div>
  );
}
