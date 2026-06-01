interface DocsManagementTemplatesMainHeaderProps {
  activeTab: "unique" | "by_doc";
  setActiveTab: (tab: "unique" | "by_doc") => void;
  uniqueCount: number;
  docCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function DocsManagementTemplatesMainHeader({
  activeTab,
  setActiveTab,
  uniqueCount,
  docCount,
  searchQuery,
  setSearchQuery,
}: DocsManagementTemplatesMainHeaderProps) {
  return (
    <div className="p-4 border-b border-border/60 bg-muted/5 flex flex-col gap-4 shrink-0">
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

        {/* Search Input */}
        <div className="relative w-full">
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
      </div>
    </div>
  );
}
