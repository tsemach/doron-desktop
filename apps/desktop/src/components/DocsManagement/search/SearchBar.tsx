import { ChevronDownIcon, SearchIcon } from "@/assets/icons";

import { Button } from "../../ui/button";
import SearchAdvanced from "./SearchAdvanced";
import type { DocumentSearchAdvancedFilters } from "./types";

type SearchBarProps = {
  text: string;
  onTextChange: (value: string) => void;
  onSearch: () => void;
  hasQuery: boolean;
  isSearching: boolean;
  hasDocumentSearch: boolean;
  showAdvancedSearch: boolean;
  onToggleAdvancedSearch: () => void;
  advancedFilters: DocumentSearchAdvancedFilters;
  onAdvancedFiltersChange: (filters: DocumentSearchAdvancedFilters) => void;
};

export default function SearchBar({
  text,
  onTextChange,
  onSearch,
  hasQuery,
  isSearching,
  hasDocumentSearch,
  showAdvancedSearch,
  onToggleAdvancedSearch,
  advancedFilters,
  onAdvancedFiltersChange,
}: SearchBarProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") onSearch();
  }

  return (
    <div className="doc-search__panel">
      <div className="doc-search__input-row">
        <SearchIcon size={18} className="doc-search__input-icon" />
        <input
          type="text"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search documents using natural language (Hebrew / English)..."
          className="doc-search__input"
        />
        <div className="doc-search__input-actions">
          <Button
            onClick={onSearch}
            disabled={!hasQuery || (isSearching && !hasDocumentSearch)}
            size="sm"
          >
            {isSearching && !hasDocumentSearch ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleAdvancedSearch}
        className="doc-search__advanced-toggle"
      >
        Advance search
        <ChevronDownIcon
          size={12}
          className={`doc-search__advanced-toggle-icon${showAdvancedSearch ? " doc-search__advanced-toggle-icon--open" : ""}`}
        />
      </button>

      {showAdvancedSearch && (
        <SearchAdvanced filters={advancedFilters} onChange={onAdvancedFiltersChange} />
      )}
    </div>
  );
}
