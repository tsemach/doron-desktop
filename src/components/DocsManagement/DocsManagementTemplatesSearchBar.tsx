
interface DocsManagementTemplatesSearchBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function DocsManagementTemplatesSearchBar({
  searchQuery,
  setSearchQuery,
}: DocsManagementTemplatesSearchBarProps) {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Filter templates..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
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
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </div>
  );
}
