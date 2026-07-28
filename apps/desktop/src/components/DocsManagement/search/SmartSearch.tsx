import { useMemo, useState } from "react";

import { useCaseLinksForPaths, useCaseSearch } from "@/hooks/case";
import { useSearch } from "@/hooks/useSearch";
import { searchDocuments } from "@/lib/search";

import SearchBar from "./SearchBar";
import SearchResults from "./SearchResults";
import {
  defaultDocumentSearchAdvancedFilters,
  resolveDocumentSearchScope,
  type DocumentSearchAdvancedFilters,
} from "./types";
import { buildQuery } from "./buildQuery";

export default function SmartSearch() {
  const [text, setText] = useState("");
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<DocumentSearchAdvancedFilters>(
    defaultDocumentSearchAdvancedFilters,
  );

  const { docType, dateFrom, dateTo, tagFilters, notesContains, searchTarget } = advancedFilters;

  const searchScope = useMemo(
    () => resolveDocumentSearchScope(searchTarget),
    [searchTarget],
  );

  const queryString = buildQuery(text, docType, dateFrom, dateTo);
  const hasStructuredFilters = tagFilters.length > 0 || !!notesContains.trim();
  const hasQuery = !!queryString.trim() || hasStructuredFilters;
  const shouldClearSearch = !hasQuery;

  const documentSearchRequest = useMemo(
    () => ({
      query: queryString,
      limit: 20,
      tags: tagFilters.length > 0 ? tagFilters : undefined,
      notesContains: notesContains.trim() || undefined,
    }),
    [queryString, tagFilters, notesContains],
  );

  const documentsSearchEnabled = searchScope.includesDocuments && hasQuery;

  const {
    results: documentSearchResponse,
    hasSearched: hasDocumentSearch,
    isSearching,
    error: documentError,
    search: runDocumentSearch,
  } = useSearch({
    searchFn: searchDocuments,
    request: documentSearchRequest,
    getQueryText: (req) => req.query,
    enabled: documentsSearchEnabled,
    shouldClear: shouldClearSearch,
  });

  const showDocumentResults = searchScope.includesDocuments && hasDocumentSearch;
  const documentResults = showDocumentResults ? (documentSearchResponse?.results ?? null) : null;
  const filePaths = useMemo(() => (documentResults ?? []).map((doc) => doc.file_path), [documentResults]);
  const { links: caseLinks } = useCaseLinksForPaths(filePaths, { isSearching });

  const caseSearchFilters = useMemo(
    () => ({ tags: tagFilters, notesContains }),
    [tagFilters, notesContains],
  );
  const caseSearchEnabled = searchScope.includesCases && hasStructuredFilters;
  const caseSearch = useCaseSearch(caseSearchFilters, { enabled: caseSearchEnabled });

  const showCaseResults = searchScope.includesCases && caseSearch.hasSearched;
  const showResultsPanel = showDocumentResults || showCaseResults;

  function handleSearch() {
    if (!hasQuery) return;
    runDocumentSearch();
  }

  function handleSuggestionClick(suggestion: string) {
    setText(suggestion);
    setTimeout(handleSearch, 50);
  }

  return (
    <div className="doc-search animate-fade-in">
      <SearchBar
        text={text}
        onTextChange={setText}
        onSearch={handleSearch}
        hasQuery={hasQuery}
        isSearching={isSearching}
        hasDocumentSearch={hasDocumentSearch}
        showAdvancedSearch={showAdvancedSearch}
        onToggleAdvancedSearch={() => setShowAdvancedSearch((open) => !open)}
        advancedFilters={advancedFilters}
        onAdvancedFiltersChange={setAdvancedFilters}
      />

      <SearchResults
        showResultsPanel={showResultsPanel}
        showCaseResults={showCaseResults}
        showDocumentResults={showDocumentResults}
        documentResults={documentResults}
        documentError={documentError}
        caseResults={caseSearch.cases}
        caseIsSearching={caseSearch.isSearching}
        caseError={caseSearch.error}
        caseLinks={caseLinks}
        onSuggestionClick={handleSuggestionClick}
      />
    </div>
  );
}
