import { Button } from "@/components/ui/button";
import OpenCasesTagSearchBar, { type OpenCasesTagFilter } from "./OpenCasesTagSearchBar";

interface OpenCasesTopBarProps {
  filter: "all" | "open" | "waiting" | "closed" | "followup";
  setFilter: (filter: "all" | "open" | "waiting" | "closed" | "followup") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  tagFilter: OpenCasesTagFilter | null;
  setTagFilter: (filter: OpenCasesTagFilter | null) => void;
  followupCount?: number;
  waitingCount?: number;
}

function FilterCountBadge({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null;
  return (
    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold rounded-full transition-all duration-150 ${
      active
        ? "bg-primary-foreground text-primary dark:bg-zinc-800 dark:text-slate-100"
        : "bg-muted-foreground/15 text-muted-foreground"
    }`}>
      {count}
    </span>
  );
}

export default function OpenCasesTopBar({
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
  tagFilter,
  setTagFilter,
  followupCount = 0,
  waitingCount = 0,
}: OpenCasesTopBarProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6 shrink-0">
      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {(["open", "all", "waiting", "followup", "closed"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "all" ? (
              "All"
            ) : s === "waiting" ? (
              <span className="flex items-center gap-1.5">
                Waiting
                <FilterCountBadge count={waitingCount} active={filter === "waiting"} />
              </span>
            ) : s === "followup" ? (
              <span className="flex items-center gap-1.5">
                Follow Up
                <FilterCountBadge count={followupCount} active={filter === "followup"} />
              </span>
            ) : (
              s.charAt(0).toUpperCase() + s.slice(1)
            )}
          </Button>
        ))}
      </div>

      {/* Search Input */}
      <OpenCasesTagSearchBar
        freeText={searchQuery}
        onFreeTextChange={setSearchQuery}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
      />
    </div>
  );
}
