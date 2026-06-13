import { Button } from "../../ui/button";
import { CaseTemplate } from "../CaseManagementTypes";

interface CaseTemplateListProps {
  caseTemplates: CaseTemplate[];
  selectedTemplateId: number | null;
  isCreating: boolean;
  onSelectTemplate: (id: number) => void;
  onStartCreate: () => void;
  width?: number;
}

export default function CaseTemplateList({
  caseTemplates,
  selectedTemplateId,
  isCreating,
  onSelectTemplate,
  onStartCreate,
  width,
}: CaseTemplateListProps) {
  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso.slice(0, 10);
    }
  }

  return (
    <aside
      style={width ? { width } : undefined}
      className={`${width ? "" : "w-1/3"} flex flex-col bg-muted/10 shrink-0 overflow-y-auto`}
    >
      <div className="p-4 border-b border-border flex items-center justify-between bg-card shrink-0">
        <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
          Templates ({caseTemplates.length})
        </span>
        <Button size="sm" onClick={onStartCreate} className="h-7 px-2.5 text-xs">
          + New Template
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {caseTemplates.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground italic">
            No templates created. Click "+ New Template" to add one.
          </div>
        ) : (
          caseTemplates.map((ct) => {
            const isSelected = ct.id === selectedTemplateId && !isCreating;
            let docCount = ct.doc_template_ids.length;
            let fieldCount = 0;
            try {
              fieldCount = JSON.parse(ct.fields).length;
            } catch { }

            return (
              <div
                key={ct.id}
                onClick={() => onSelectTemplate(ct.id)}
                className={`p-4 cursor-pointer hover:bg-muted/80 transition-all border-l-4 ${isSelected
                    ? "bg-accent/40 border-primary border-b"
                    : "border-transparent bg-transparent"
                  }`}
              >
                <h4 className="font-semibold text-sm text-foreground truncate" title={ct.name}>
                  {ct.name}
                </h4>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground font-mono">
                  <span>
                    {docCount} {docCount === 1 ? "doc" : "docs"} &bull; {fieldCount} {fieldCount === 1 ? "field" : "fields"}
                  </span>
                  <span>{formatDate(ct.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
