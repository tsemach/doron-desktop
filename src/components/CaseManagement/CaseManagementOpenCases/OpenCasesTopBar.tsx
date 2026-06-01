import { Button } from "@/components/ui/button";

interface OpenCasesTopBarProps {
  filter: "all" | "open" | "in-progress" | "closed";
  setFilter: (filter: "all" | "open" | "in-progress" | "closed") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function OpenCasesTopBar({
  filter,
  setFilter,
  searchQuery,
  setSearchQuery,
}: OpenCasesTopBarProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6 shrink-0">
      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "open", "in-progress", "closed"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "all" ? "All" : s === "in-progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative flex items-center w-full sm:w-80">
        <span className="absolute left-3 text-muted-foreground">
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
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search cases by subject, customer, folder..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 text-muted-foreground hover:text-foreground p-1 rounded-sm"
            title="Clear search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
