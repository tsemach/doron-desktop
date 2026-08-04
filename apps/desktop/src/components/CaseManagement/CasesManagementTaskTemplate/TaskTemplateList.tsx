import { Download } from "lucide-react";
import { Button } from "../../ui/button";
import { TaskTemplate } from "@/lib/task/types";

interface TaskTemplateListProps {
  taskTemplates: TaskTemplate[];
  selectedTemplateId: number | null;
  isCreating: boolean;
  onSelectTemplate: (id: number) => void;
  onStartCreate: () => void;
  width?: number;
}

export default function TaskTemplateList({
  taskTemplates,
  selectedTemplateId,
  isCreating,
  onSelectTemplate,
  onStartCreate,
  width,
}: TaskTemplateListProps) {
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
          Templates ({taskTemplates.length})
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" disabled title="Coming soon">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
          <Button size="sm" onClick={onStartCreate} className="h-7 px-2.5 text-xs">
            + New Template
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {taskTemplates.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground italic">
            No templates created. Click "+ New Template" to add one.
          </div>
        ) : (
          taskTemplates.map((tt) => {
            const isSelected = tt.id === selectedTemplateId && !isCreating;
            const itemCount = tt.items.length;

            return (
              <div
                key={tt.id}
                onClick={() => onSelectTemplate(tt.id)}
                className={`p-4 cursor-pointer hover:bg-muted/80 transition-all border-l-4 ${isSelected
                    ? "bg-accent/40 border-primary border-b"
                    : "border-transparent bg-transparent"
                  }`}
              >
                <h4 className="font-semibold text-sm text-foreground truncate" title={tt.name}>
                  {tt.name}
                </h4>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground font-mono">
                  <span>
                    {itemCount} {itemCount === 1 ? "task" : "tasks"}
                  </span>
                  <span>{formatDate(tt.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
