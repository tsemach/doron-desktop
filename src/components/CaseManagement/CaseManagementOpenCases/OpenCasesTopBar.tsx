import { Button } from "@/components/ui/button";
import CaseManagementSearch from "../CaseManagementSearch";

interface OpenCasesTopBarProps {
  filter: "all" | "open" | "in-progress" | "closed" | "followup";
  setFilter: (filter: "all" | "open" | "in-progress" | "closed" | "followup") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  followupCount?: number;
}

export default function OpenCasesTopBar({
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
  followupCount = 0,
}: OpenCasesTopBarProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6 shrink-0">
      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "open", "in-progress", "closed", "followup"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "all" ? (
              "All"
            ) : s === "in-progress" ? (
              "In Progress"
            ) : s === "followup" ? (
              <span className="flex items-center gap-1.5">
                Follow Up
                {followupCount > 0 && (
                  <span className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold rounded-full transition-all duration-150 ${
                    filter === "followup"
                      ? "bg-primary-foreground text-primary dark:bg-zinc-800 dark:text-slate-100"
                      : "bg-muted-foreground/15 text-muted-foreground"
                  }`}>
                    {followupCount}
                  </span>
                )}
              </span>
            ) : (
              s.charAt(0).toUpperCase() + s.slice(1)
            )}
          </Button>
        ))}
      </div>

      {/* Search Input */}
      <CaseManagementSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search cases by subject, customer, folder..."
        containerClassName="relative flex items-center w-full sm:w-80"
        inputClassName="w-full rounded-md border border-input bg-background pl-9 pr-8 py-1.5 text-sm placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
        searchIconSize={14}
        searchIconStrokeWidth={2.5}
        searchIconClassName="absolute left-3 text-muted-foreground"
        clearIconSize={12}
        clearButtonClassName="absolute right-2.5 text-muted-foreground hover:text-foreground p-1 rounded-sm"
        clearButtonTitle="Clear search"
      />
    </div>
  );
}
