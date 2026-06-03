import OpenCasesListItem from "./OpenCasesListItem";

export type CaseStatus = "open" | "in-progress" | "closed";

export interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;
}

interface OpenCasesListProps {
  cases: Case[];
  selectedCase: Case | null;
  loading: boolean;
  isLgScreen: boolean;
  leftPercent: number;
  onSelectCase: (c: Case) => void;
  onCloseCase: (id: string) => void;
  onDeleteCase: (c: Case) => void;
  onOpenFolder: (folderPath: string) => void;
}

export default function OpenCasesList({
  cases,
  selectedCase,
  loading,
  isLgScreen,
  leftPercent,
  onSelectCase,
  onCloseCase,
  onDeleteCase,
  onOpenFolder,
}: OpenCasesListProps) {
  return (
    <div
      style={isLgScreen ? { flex: `0 0 calc(${leftPercent}% - 6px)` } : undefined}
      className="flex flex-col border border-border rounded-xl bg-card overflow-hidden h-full shadow-xs"
    >
      <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
        <span>Cases List</span>
        <span className="text-xs text-muted-foreground font-normal">{cases.length} visible</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <div className="animate-spin text-2xl font-bold mb-2">⟳</div>
            <p className="text-sm">Loading cases...</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground py-12">
            <p className="text-sm">No cases match your filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/40 text-muted-foreground sticky top-0 z-10 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Case Info</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <OpenCasesListItem
                  key={c.id}
                  c={c}
                  isSelected={selectedCase?.id === c.id}
                  onSelectCase={onSelectCase}
                  onCloseCase={onCloseCase}
                  onDeleteCase={onDeleteCase}
                  onOpenFolder={onOpenFolder}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
