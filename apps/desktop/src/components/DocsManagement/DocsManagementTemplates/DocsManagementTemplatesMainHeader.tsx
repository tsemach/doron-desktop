import { Button } from "../../ui/button";

interface DocsManagementTemplatesMainHeaderProps {
  activeTab: "unique" | "by_doc";
  setActiveTab: (tab: "unique" | "by_doc") => void;
  uniqueCount: number;
  docCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  uniqueRows: number[];
  selectedRow: number | null;
  setSelectedRow: (row: number | null) => void;
  onSyncAllFields?: () => void;
  isSyncingAll?: boolean;
}

export default function DocsManagementTemplatesMainHeader({
  activeTab,
  setActiveTab,
  uniqueCount,
  docCount,
  searchQuery,
  setSearchQuery,
  uniqueRows,
  selectedRow,
  setSelectedRow,
  onSyncAllFields,
  isSyncingAll,
}: DocsManagementTemplatesMainHeaderProps) {
  return (
    <div className="p-4 border-b border-border/60 bg-muted/5 flex flex-col gap-4 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
          </svg>
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
            Available Fields Dictionary
          </h4>
        </div>

        {onSyncAllFields && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncAllFields}
            disabled={isSyncingAll}
            className="flex items-center gap-1.5 text-[11px] h-7 px-2.5 bg-background border-border hover:bg-muted"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isSyncingAll ? "animate-spin" : ""}
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            {isSyncingAll ? "Syncing..." : "Sync All Fields"}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Tabs Selector */}
        <div className="inline-flex rounded-lg bg-muted p-1 text-muted-foreground text-[11px] self-start select-none">
          <button
            onClick={() => setActiveTab("unique")}
            className={`px-3 py-1.2 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "unique"
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground"
            }`}
          >
            All Unique Fields ({uniqueCount})
          </button>
          <button
            onClick={() => setActiveTab("by_doc")}
            className={`px-3 py-1.2 rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "by_doc"
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground"
            }`}
          >
            By Document ({docCount})
          </button>
        </div>

        {/* Search and Row Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <div className="relative flex-1">
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
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search variables or document names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-card pl-8 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground font-semibold text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {uniqueRows.length > 0 && (
            <div className="relative w-full sm:w-[120px] shrink-0 animate-in fade-in duration-200">
              <select
                value={selectedRow ?? "all"}
                onChange={(e) => setSelectedRow(e.target.value === "all" ? null : parseInt(e.target.value, 10))}
                className="w-full h-[30px] rounded-md border border-input bg-card pl-3 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
              >
                <option value="all">All Rows</option>
                {uniqueRows.map((row) => (
                  <option key={row} value={row}>
                    Row {row}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-2.5 flex items-center pointer-events-none text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
