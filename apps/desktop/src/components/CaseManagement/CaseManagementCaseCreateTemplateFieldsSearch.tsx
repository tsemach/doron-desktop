interface CaseManagementCaseCreateTemplateFieldsSearchProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}

export default function CaseManagementCaseCreateTemplateFieldsSearch({
  searchQuery,
  onSearchQueryChange,
}: CaseManagementCaseCreateTemplateFieldsSearchProps) {
  return (
    <div className="relative w-full sm:flex-1">
      <input
        type="text"
        placeholder="Search fields..."
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        className="w-full pl-9 pr-8 py-2 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-mono"
      />
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
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      {searchQuery && (
        <button
          type="button"
          onClick={() => onSearchQueryChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground font-semibold text-xs cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  );
}
