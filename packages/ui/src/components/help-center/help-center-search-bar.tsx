import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "../../lib/utils";

export type HelpCenterSearchBarProps = {
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
};

// Split out from HelpCenterPage so callers can place it in their own header
// row (e.g. alongside a back button), matching each app's page-header
// convention instead of a fixed layout baked into this package.
export function HelpCenterSearchBar({ placeholder, onSearch, className }: HelpCenterSearchBarProps) {
  const [query, setQuery] = React.useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSearch?.(query);
  }

  return (
    <form onSubmit={handleSubmit} className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
  );
}
