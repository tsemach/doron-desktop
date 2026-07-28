import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "../ui/button";
import CaseStatusBadge from "../ui/CaseStatusBadge";
import FileTypeIcon from "../ui/FileTypeIcon";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";
import type { CaseStatus } from "../CaseManagement/CaseManagementTypes";
import { useCaseLinksForPaths, useCaseSearch } from "../../hooks/case";
import { useSearch } from "../../hooks/useSearch";
import { searchDocuments } from "../../lib/search";
import type { DocumentSearchAdvancedFilters } from "./DocsManagementSearch.types";

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

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const queryString = buildQuery(text, docType, dateFrom, dateTo);
  const hasStructuredFilters = tagFilters.length > 0 || !!notesContains.trim();
  const [aiConfig, setAiConfig] = useState<any>(null);
  // Only free-text search is AI-driven; structured filters are deterministic SQL.
  // While aiConfig is still loading, fail closed on missing localStorage key so
  // debounced auto-search cannot fire before settings resolve.
  const needsApiKey = !!text.trim() && (aiConfig === null || aiConfig.ai_mode === "byom");
  const showWarning = aiConfig
    ? aiConfig.ai_mode === "byom" && !aiConfig.api_key_enc
    : !apiKey;
  const shouldClearSearch = !queryString.trim() && !hasStructuredFilters;

  const documentSearchRequest = useMemo(
    () => ({
      query: queryString,
      apiKey,
      limit: 20,
      tags: tagFilters.length > 0 ? tagFilters : undefined,
      notesContains: notesContains.trim() || undefined,
    }),
    [queryString, apiKey, tagFilters, notesContains],
  );

  const documentsSearchEnabled =
    searchTarget !== "cases" &&
    (!!queryString.trim() || hasStructuredFilters) &&
    !(needsApiKey && showWarning);

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

  const results = searchTarget !== "cases" ? (documentSearchResponse?.results ?? null) : null;
  const filePaths = useMemo(() => (results ?? []).map((doc) => doc.file_path), [results]);
  const { links: caseLinks } = useCaseLinksForPaths(filePaths, { isSearching });

  const caseSearchFilters = useMemo(
    () => ({ tags: tagFilters, notesContains }),
    [tagFilters, notesContains],
  );
  const caseSearchEnabled = searchTarget !== "documents" && hasStructuredFilters;
  const caseSearch = useCaseSearch(caseSearchFilters, { enabled: caseSearchEnabled });

  const showResultsPanel =
    (searchTarget !== "cases" && hasDocumentSearch) ||
    (caseSearchEnabled && caseSearch.hasSearched);

  useEffect(() => {
    invoke<any>("get_ai_settings").then(setAiConfig).catch(() => { });
  }, []);

  async function handleOpenFile(path: string) {
    try {
      await invoke("open_path", { path });
    } catch (e) {
      console.error("Failed to open file:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function handleSearch() {
    if ((!queryString.trim() && !hasStructuredFilters) || (needsApiKey && showWarning)) return;
    runDocumentSearch();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="doc-search animate-fade-in">
      <div className="doc-search__panel">
        <div className="doc-search__input-row">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="doc-search__input-icon"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
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
              disabled={(!queryString.trim() && !hasStructuredFilters) || (needsApiKey && showWarning) || (isSearching && !hasDocumentSearch)}
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`doc-search__advanced-toggle-icon${showAdvancedSearch ? " doc-search__advanced-toggle-icon--open" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {advancedSearch}
      </div>

      {error && (
        <div className="doc-search__error">
          <span className="doc-search__error-label">Search Error: </span>
          {error}
        </div>
      )}

      {showWarning && (
        <div className="doc-search__warning">
          No API key is configured. Please navigate to the settings page to connect your AI credentials.
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
          {caseSearchEnabled && caseSearch.hasSearched && (
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

          {searchTarget !== "cases" && hasDocumentSearch && (
            <div className="doc-search__results-section">
              <div className="doc-search__results-count">
                <span>
                  {results === null || results.length === 0
                    ? "No matching documents found."
                    : `Showing ${results.length} relevant document${results.length !== 1 ? "s" : ""}`}
                </span>
              </div>

              <div className="doc-search__doc-list">
                {(results ?? []).map((doc) => {
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="doc-search__case-link-icon">
                              <path d="M15 3h6v6" />
                              <path d="M10 14 21 3" />
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
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
