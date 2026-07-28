import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { ExternalLinkIcon, SearchIcon } from "@/assets/icons";
import type { CaseLink, CaseSearchRow } from "@/lib/case";
import type { DocumentRow } from "@/lib/documents/types";

import type { CaseStatus } from "../../CaseManagement/CaseManagementTypes";
import CaseStatusBadge from "../../ui/CaseStatusBadge";
import ErrorAlert from "../../ui/ErrorAlert";
import FileTypeIcon from "../../ui/FileTypeIcon";

const POPULAR_SEARCHES = [
  "חוזה שכירות",
  "Annual report 2024",
  "הסכם סודיות NDA",
  "Client invoice template",
] as const;

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

function SearchError({ label, message }: { label: string; message: string }) {
  return (
    <div className="doc-search__error">
      <span className="doc-search__error-label">{label}: </span>
      {message}
    </div>
  );
}

function CaseResultItem({
  caseRow,
  onSelect,
}: {
  caseRow: CaseSearchRow;
  onSelect: (id: number) => void;
}) {
  return (
    <div onClick={() => onSelect(caseRow.id)} className="doc-search__case-card">
      <div className="doc-search__case-content">
        <div className="doc-search__case-title">{caseRow.subject || "Untitled Case"}</div>
        {caseRow.folder && <div className="doc-search__case-folder">{caseRow.folder}</div>}
      </div>
      <CaseStatusBadge status={caseRow.status as CaseStatus} className="doc-search__case-badge" />
    </div>
  );
}

function CaseResultsSection({
  results,
  isSearching,
  onSelectCase,
}: {
  results: CaseSearchRow[];
  isSearching: boolean;
  onSelectCase: (id: number) => void;
}) {
  const countLabel = isSearching
    ? "Searching cases..."
    : results.length === 0
      ? "No matching cases found."
      : `Showing ${results.length} matching case${results.length !== 1 ? "s" : ""}`;

  return (
    <div className="doc-search__results-section">
      <div className="doc-search__results-count">
        <span>{countLabel}</span>
      </div>

      <div className="doc-search__case-list">
        {results.map((caseRow) => (
          <CaseResultItem key={caseRow.id} caseRow={caseRow} onSelect={onSelectCase} />
        ))}
      </div>
    </div>
  );
}

function DocumentMetaChips({ doc }: { doc: DocumentRow }) {
  return (
    <div className="doc-search__tag-cloud">
      {doc.keywords.slice(0, 5).map((k) => (
        <span key={k} className="doc-search__meta-chip doc-search__meta-chip--keyword">
          #{k}
        </span>
      ))}

      {doc.topics.slice(0, 3).map((t) => (
        <span key={t} className="doc-search__meta-chip doc-search__meta-chip--topic">
          🔮 {t}
        </span>
      ))}

      {doc.entities.slice(0, 3).map((e) => (
        <span key={e} className="doc-search__meta-chip doc-search__meta-chip--entity">
          💼 {e}
        </span>
      ))}

      {doc.authors.slice(0, 2).map((a) => (
        <span key={a} className="doc-search__meta-chip doc-search__meta-chip--author">
          👤 {a}
        </span>
      ))}
    </div>
  );
}

function DocumentResultItem({
  doc,
  matchedCase,
  onOpenFile,
  onSelectCase,
}: {
  doc: DocumentRow;
  matchedCase?: CaseLink;
  onOpenFile: (path: string) => void;
  onSelectCase: (id: string | number) => void;
}) {
  const fileExtension = doc.file_name.split(".").pop() || "";

  return (
    <div className="doc-search__doc-card">
      <FileTypeIcon ext={fileExtension} />

      <div className="doc-search__doc-body">
        <div className="doc-search__doc-header">
          <div className="doc-search__doc-meta">
            <span
              onClick={() => onOpenFile(doc.file_path)}
              className="doc-search__doc-name"
              title="Click to open file"
            >
              {doc.file_name}
            </span>
            {doc.doc_type && <span className="doc-search__doc-type-badge">{doc.doc_type}</span>}
            {doc.language && <span className="doc-search__doc-lang-badge">{doc.language}</span>}
            {matchedCase && (
              <button
                onClick={() => onSelectCase(matchedCase.id)}
                className="doc-search__case-link"
                title={`Jump to case: ${matchedCase.subject}`}
              >
                <ExternalLinkIcon size={10} className="doc-search__case-link-icon" />
                <span>Go to Case</span>
              </button>
            )}
          </div>
          <div className="doc-search__doc-aside">
            {doc.doc_date && <span className="doc-search__doc-date">{doc.doc_date}</span>}
            <ConfidenceBadge value={doc.confidence} />
          </div>
        </div>

        <p
          onClick={() => onOpenFile(doc.file_path)}
          className="doc-search__doc-path"
          title={doc.file_path}
        >
          {doc.file_path}
        </p>

        {doc.title && <h4 className="doc-search__doc-title">{doc.title}</h4>}
        {doc.summary && <p className="doc-search__doc-summary">{doc.summary}</p>}
        <DocumentMetaChips doc={doc} />
      </div>
    </div>
  );
}

function DocumentResultsSection({
  results,
  caseLinks,
  onOpenFile,
  onSelectCase,
}: {
  results: DocumentRow[] | null;
  caseLinks: Map<string, CaseLink>;
  onOpenFile: (path: string) => void;
  onSelectCase: (id: string | number) => void;
}) {
  const countLabel =
    results === null || results.length === 0
      ? "No matching documents found."
      : `Showing ${results.length} relevant document${results.length !== 1 ? "s" : ""}`;

  return (
    <div className="doc-search__results-section">
      <div className="doc-search__results-count">
        <span>{countLabel}</span>
      </div>

      <div className="doc-search__doc-list">
        {(results ?? []).map((doc) => (
          <DocumentResultItem
            key={doc.id}
            doc={doc}
            matchedCase={caseLinks.get(doc.file_path)}
            onOpenFile={onOpenFile}
            onSelectCase={onSelectCase}
          />
        ))}
      </div>
    </div>
  );
}

function SearchIdleState({
  onSuggestionClick,
}: {
  onSuggestionClick: (suggestion: string) => void;
}) {
  return (
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
        <span className="doc-search__suggestions-label">Popular Searches</span>
        {POPULAR_SEARCHES.map((suggest) => (
          <button
            key={suggest}
            type="button"
            onClick={() => onSuggestionClick(suggest)}
            className="doc-search__suggestion-btn"
          >
            "{suggest}"
          </button>
        ))}
      </div>
    </div>
  );
}

type SearchResultsProps = {
  showResultsPanel: boolean;
  showCaseResults: boolean;
  showDocumentResults: boolean;
  documentResults: DocumentRow[] | null;
  documentError: string | null;
  caseResults: CaseSearchRow[];
  caseIsSearching: boolean;
  caseError: string | null;
  caseLinks: Map<string, CaseLink>;
  onSuggestionClick: (suggestion: string) => void;
};

export default function SearchResults({
  showResultsPanel,
  showCaseResults,
  showDocumentResults,
  documentResults,
  documentError,
  caseResults,
  caseIsSearching,
  caseError,
  caseLinks,
  onSuggestionClick,
}: SearchResultsProps) {
  const navigate = useNavigate();
  const [openFileError, setOpenFileError] = useState<string | null>(null);

  async function handleOpenFile(path: string) {
    try {
      await invoke("open_path", { path });
    } catch (e) {
      setOpenFileError(`Failed to open file: ${e}`);
    }
  }

  function handleSelectCase(id: string | number) {
    navigate(`/case-management/cases/${id}`);
  }

  return (
    <>
      {documentError && <SearchError label="Search Error" message={documentError} />}
      {caseError && <SearchError label="Case Search Error" message={caseError} />}

      {showResultsPanel ? (
        <div className="doc-search__results">
          {showCaseResults && (
            <CaseResultsSection
              results={caseResults}
              isSearching={caseIsSearching}
              onSelectCase={handleSelectCase}
            />
          )}

          {showDocumentResults && (
            <DocumentResultsSection
              results={documentResults}
              caseLinks={caseLinks}
              onOpenFile={handleOpenFile}
              onSelectCase={handleSelectCase}
            />
          )}
        </div>
      ) : (
        <SearchIdleState onSuggestionClick={onSuggestionClick} />
      )}

      {openFileError && (
        <ErrorAlert message={openFileError} onClose={() => setOpenFileError(null)} />
      )}
    </>
  );
}
