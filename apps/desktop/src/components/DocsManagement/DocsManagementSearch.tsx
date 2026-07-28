import { useState, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { ChevronDownIcon, ExternalLinkIcon, SearchIcon } from "@/assets/icons";
import { Button } from "../ui/button";
import CaseStatusBadge from "../ui/CaseStatusBadge";
import FileTypeIcon from "../ui/FileTypeIcon";
import type { CaseStatus } from "../CaseManagement/CaseManagementTypes";
import { useCaseLinksForPaths, useCaseSearch } from "../../hooks/case";
import { useSearch } from "../../hooks/useSearch";
import { searchDocuments } from "../../lib/search";
import {
  resolveDocumentSearchScope,
  type DocumentSearchAdvancedFilters,
} from "./DocsManagementSearch.types";

function buildQuery(text: string, docType: string, dateFrom: string, dateTo: string): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());
  if (docType) parts.push(`document type: ${docType}`);
  if (dateFrom && dateTo) parts.push(`from ${dateFrom} to ${dateTo}`);
  else if (dateFrom) parts.push(`from ${dateFrom}`);
  else if (dateTo) parts.push(`until ${dateTo}`);
  return parts.join(", ");
}

function confidenceLevel(pct: number): "high" | "medium" | "low" {
  if (pct >= 85) return "high";
  if (pct >= 70) return "medium";
  return "low";
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);

  return (
    <div className={`doc-search__confidence doc-search__confidence--${confidenceLevel(pct)}`}>
      <span>Match:</span>
      <span className="doc-search__confidence-value">{pct}%</span>
    </div>
  );
}

type DocsManagementSearchProps = {
  advancedFilters: DocumentSearchAdvancedFilters;
  showAdvancedSearch: boolean;
  onToggleAdvancedSearch: () => void;
  advancedSearch: ReactNode;
};

export default function DocsManagementSearch({
  advancedFilters,
  showAdvancedSearch,
  onToggleAdvancedSearch,
  advancedSearch,
}: DocsManagementSearchProps) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
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
    error,
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

  async function handleOpenFile(path: string) {
    try {
      await invoke("open_path", { path });
    } catch (e) {
      console.error("Failed to open file:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function handleSearch() {
    if (!hasQuery) return;
    runDocumentSearch();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="doc-search animate-fade-in">
      <div className="doc-search__panel">
        <div className="doc-search__input-row">
          <SearchIcon size={18} className="doc-search__input-icon" />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents using natural language (Hebrew / English)..."
            className="doc-search__input"
          />
          <div className="doc-search__input-actions">
            <Button
              onClick={handleSearch}
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

        {advancedSearch}
      </div>

      {error && (
        <div className="doc-search__error">
          <span className="doc-search__error-label">Search Error: </span>
          {error}
        </div>
      )}

      {caseSearch.error && (
        <div className="doc-search__error">
          <span className="doc-search__error-label">Case Search Error: </span>
          {caseSearch.error}
        </div>
      )}

      {showResultsPanel ? (
        <div className="doc-search__results">
          {showCaseResults && (
            <div className="doc-search__results-section">
              <div className="doc-search__results-count">
                <span>
                  {caseSearch.isSearching
                    ? "Searching cases..."
                    : caseSearch.cases.length === 0
                      ? "No matching cases found."
                      : `Showing ${caseSearch.cases.length} matching case${caseSearch.cases.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              <div className="doc-search__case-list">
                {caseSearch.cases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/case-management/cases/${c.id}`)}
                    className="doc-search__case-card"
                  >
                    <div className="doc-search__case-content">
                      <div className="doc-search__case-title">{c.subject || "Untitled Case"}</div>
                      {c.folder && (
                        <div className="doc-search__case-folder">{c.folder}</div>
                      )}
                    </div>
                    <CaseStatusBadge status={c.status as CaseStatus} className="doc-search__case-badge" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {showDocumentResults && (
            <div className="doc-search__results-section">
              <div className="doc-search__results-count">
                <span>
                  {documentResults === null || documentResults.length === 0
                    ? "No matching documents found."
                    : `Showing ${documentResults.length} relevant document${documentResults.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              <div className="doc-search__doc-list">
                {(documentResults ?? []).map((doc) => {
              const fileExtension = doc.file_name.split(".").pop() || "";
              const matchedCase = caseLinks.get(doc.file_path);
              return (
                <div
                  key={doc.id}
                  className="doc-search__doc-card"
                >
                  <FileTypeIcon ext={fileExtension} />

                  <div className="doc-search__doc-body">
                    <div className="doc-search__doc-header">
                      <div className="doc-search__doc-meta">
                        <span
                          onClick={() => handleOpenFile(doc.file_path)}
                          className="doc-search__doc-name"
                          title="Click to open file"
                        >
                          {doc.file_name}
                        </span>
                        {doc.doc_type && (
                          <span className="doc-search__doc-type-badge">
                            {doc.doc_type}
                          </span>
                        )}
                        {doc.language && (
                          <span className="doc-search__doc-lang-badge">
                            {doc.language}
                          </span>
                        )}
                        {matchedCase && (
                          <button
                            onClick={() => navigate(`/case-management/cases/${matchedCase.id}`)}
                            className="doc-search__case-link"
                            title={`Jump to case: ${matchedCase.subject}`}
                          >
                            <ExternalLinkIcon size={10} className="doc-search__case-link-icon" />
                            <span>Go to Case</span>
                          </button>
                        )}
                      </div>
                      <div className="doc-search__doc-aside">
                        {doc.doc_date && (
                          <span className="doc-search__doc-date">{doc.doc_date}</span>
                        )}
                        <ConfidenceBadge value={doc.confidence} />
                      </div>
                    </div>

                    <p
                      onClick={() => handleOpenFile(doc.file_path)}
                      className="doc-search__doc-path"
                      title={doc.file_path}
                    >
                      {doc.file_path}
                    </p>

                    {doc.title && (
                      <h4 className="doc-search__doc-title">
                        {doc.title}
                      </h4>
                    )}

                    {doc.summary && (
                      <p className="doc-search__doc-summary">
                        {doc.summary}
                      </p>
                    )}

                    <div className="doc-search__tag-cloud">
                      {doc.keywords.slice(0, 5).map((k) => (
                        <span
                          key={k}
                          className="doc-search__meta-chip doc-search__meta-chip--keyword"
                        >
                          #{k}
                        </span>
                      ))}

                      {doc.topics.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="doc-search__meta-chip doc-search__meta-chip--topic"
                        >
                          🔮 {t}
                        </span>
                      ))}

                      {doc.entities.slice(0, 3).map((e) => (
                        <span
                          key={e}
                          className="doc-search__meta-chip doc-search__meta-chip--entity"
                        >
                          💼 {e}
                        </span>
                      ))}

                      {doc.authors.slice(0, 2).map((a) => (
                        <span
                          key={a}
                          className="doc-search__meta-chip doc-search__meta-chip--author"
                        >
                          👤 {a}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="doc-search__idle animate-fade-in-up">
          <div className="doc-search__idle-icon-wrap">
            <SearchIcon size={26} className="doc-search__idle-icon" />
          </div>
          <div className="doc-search__idle-copy">
            <h3 className="doc-search__idle-title">Ready to Search</h3>
            <p className="doc-search__idle-description">
              Enter semantic descriptions or keywords to look through your synced knowledge bases.
            </p>
          </div>

          <div className="doc-search__suggestions">
            <span className="doc-search__suggestions-label">
              Popular Searches
            </span>
            {[
              "חוזה שכירות",
              "Annual report 2024",
              "הסכם סודיות NDA",
              "Client invoice template",
            ].map((suggest) => (
              <button
                key={suggest}
                onClick={() => {
                  setText(suggest);
                  setTimeout(handleSearch, 50);
                }}
                className="doc-search__suggestion-btn"
              >
                "{suggest}"
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
