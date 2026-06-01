import { Button } from "@/components/ui/button";

type CaseStatus = "open" | "in-progress" | "closed";

interface Case {
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

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "in-progress": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

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
                <tr
                  key={c.id}
                  onClick={() => onSelectCase(c)}
                  className={`border-t border-border cursor-pointer transition-all hover:bg-muted/30 ${
                    selectedCase?.id === c.id
                      ? "bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary font-medium"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-foreground leading-snug">{c.subject || "No Subject"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-normal">{c.name}</div>
                    {c.folder && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className="text-[10px] text-muted-foreground/75 font-mono truncate max-w-[220px]"
                          title={c.folder}
                        >
                          {c.folder}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFolder(c.folder!);
                          }}
                          className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded hover:bg-muted/80 transition-colors"
                          title="Open folder in File Explorer"
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
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 align-middle">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-middle text-xs text-muted-foreground whitespace-nowrap">
                    {c.createdAt}
                  </td>
                  <td className="px-4 py-3.5 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end items-center">
                      {c.status !== "closed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onCloseCase(c.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Close Case"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="m9 12 2 2 4-4" />
                          </svg>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteCase(c)}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete Case"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
