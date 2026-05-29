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
}

export default function DocsManagementTemplatesForm({
  selectedTemplate,
  fieldValues,
  setFieldValues,
  generating,
  genResult,
  onGenerate,
  onClearSelection,
}: DocsManagementTemplatesFormProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header Details */}
      <div className="p-6 border-b border-border/60 bg-muted/10 shrink-0 flex items-center justify-between">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground truncate">
              {selectedTemplate.file_name}
            </h3>
            <span className="shrink-0 text-[10px] font-mono bg-muted border rounded-full px-2 py-0.5 text-muted-foreground uppercase">
              {selectedTemplate.file_ext}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate font-mono">
            Path: {selectedTemplate.original_path}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>

      {/* Variable form */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h4 className="text-xs font-bold text-foreground mb-1 uppercase tracking-wider">
            Fill Document Variables
          </h4>
          <p className="text-xs text-muted-foreground">
            Provide values for the parsed template placeholders. Blank variables will not be
            replaced.
          </p>
        </div>

        {Object.keys(fieldValues).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10">
            No placeholder tags (e.g. `[Variable]`) were identified in this document.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(fieldValues).map((field) => (
              <div key={field} className="space-y-1.5">
                <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase tracking-wide">
                  {field.replace(/_/g, " ")}
                </label>
                <input
                  type="text"
                  value={fieldValues[field]}
                  onChange={(e) =>
                    setFieldValues({ ...fieldValues, [field]: e.target.value })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={`Enter value for ${field}...`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Gen results message */}
        {genResult && (
          <div
            className={`rounded-lg border p-4 text-xs font-medium ${
              genResult.status === "failed"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            <p className="font-bold">
              {genResult.status === "ok" ? "Success!" : "Generation Failed"}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed break-all">
              {genResult.message}
            </p>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="p-4 border-t border-border bg-muted/10 shrink-0 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClearSelection}>
          Cancel
        </Button>
        <Button size="sm" onClick={onGenerate} disabled={generating}>
          {generating ? "Generating Document..." : "Generate & Save Document"}
        </Button>
      </div>
    </div>
  );
}
