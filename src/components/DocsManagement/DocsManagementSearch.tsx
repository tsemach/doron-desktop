import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "../ui/button";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";

const DOC_TYPES = [
  "contract", "report", "invoice", "memo", "specification",
  "presentation", "spreadsheet", "letter", "policy", "manual", "other",
];

type DocumentRow = {
  id: number;
  file_path: string;
  file_name: string;
  title: string | null;
  summary: string | null;
  doc_type: string | null;
  doc_date: string | null;
  language: string | null;
  keywords: string[];
  topics: string[];
  entities: string[];
  authors: string[];
  page_count: number | null;
  confidence: number | null;
};

function buildQuery(text: string, docType: string, dateFrom: string, dateTo: string): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());
  if (docType) parts.push(`document type: ${docType}`);
  if (dateFrom && dateTo) parts.push(`from ${dateFrom} to ${dateTo}`);
  else if (dateFrom) parts.push(`from ${dateFrom}`);
  else if (dateTo) parts.push(`until ${dateTo}`);
  return parts.join(", ");
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "text-green-600" : pct >= 60 ? "text-yellow-600" : "text-red-500";
  return <span className={`text-xs font-mono ${color}`}>{pct}%</span>;
}

export default function DocsManagementSearch() {
  const [text, setText] = useState("");
  const [docType, setDocType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<DocumentRow[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const queryString = buildQuery(text, docType, dateFrom, dateTo);

  async function handleOpenFile(path: string) {
    try {
      await openPath(path);
    } catch (e) {
      console.error("Failed to open file:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function handleSearch() {
    if (!queryString || !apiKey) return;
    setIsSearching(true);
    setError(null);
    try {
      const rows = await invoke<DocumentRow[]>("search_documents", {
        query: queryString,
        apiKey,
        limit: 20,
      });
      setResults(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="mt-2 space-y-4">

      {/* Query inputs */}
      <div className="space-y-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search in Hebrew or English..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Doc type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Any</option>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button
            onClick={handleSearch}
            disabled={!queryString || !apiKey || isSearching}
            className="ml-auto"
          >
            {isSearching ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-400 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* No API key hint */}
      {!apiKey && (
        <p className="text-xs text-muted-foreground">
          No API key set — go to Settings to add your Claude API key.
        </p>
      )}

      {/* Results */}
      {results !== null && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {results.length === 0
              ? "No documents found."
              : `${results.length} document${results.length !== 1 ? "s" : ""} found`}
          </p>

          {results.map((doc) => (
            <div
              key={doc.id}
              className="rounded-md border bg-card p-3 space-y-1.5 hover:bg-muted/30 transition-colors"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span
                      onClick={() => handleOpenFile(doc.file_path)}
                      className="font-mono text-sm font-medium truncate cursor-pointer text-primary hover:underline hover:text-primary/80"
                      title="Click to open file"
                    >
                      {doc.file_name}
                    </span>
                    {doc.doc_type && (
                      <span className="shrink-0 text-xs rounded px-1.5 py-0.5 bg-muted text-muted-foreground uppercase">
                        {doc.doc_type}
                      </span>
                    )}
                    {doc.language && (
                      <span className="shrink-0 text-xs rounded px-1.5 py-0.5 border text-muted-foreground">
                        {doc.language}
                      </span>
                    )}
                  </div>
                  <span
                    onClick={() => handleOpenFile(doc.file_path)}
                    className="text-[11px] text-muted-foreground truncate font-mono mt-0.5 cursor-pointer hover:underline hover:text-foreground"
                    title={doc.file_path}
                  >
                    {doc.file_path}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                  {doc.doc_date && <span>{doc.doc_date}</span>}
                  <ConfidenceBadge value={doc.confidence} />
                </div>
              </div>

              {/* Title */}
              {doc.title && (
                <p className="text-sm font-medium leading-snug">{doc.title}</p>
              )}

              {/* Summary */}
              {doc.summary && (
                <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                  {doc.summary}
                </p>
              )}

              {/* Keywords */}
              {doc.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {doc.keywords.slice(0, 7).map((k) => (
                    <span key={k} className="text-xs bg-muted rounded px-1.5 py-0.5">
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
