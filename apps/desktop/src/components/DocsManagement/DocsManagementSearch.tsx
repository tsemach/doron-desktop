import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "../ui/button";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";

const DOC_TYPES = [
  "contract",
  "report",
  "invoice",
  "memo",
  "specification",
  "presentation",
  "spreadsheet",
  "letter",
  "policy",
  "manual",
  "other",
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

function FileIcon({ ext }: { ext: string }) {
  const normalized = ext.toLowerCase().replace(".", "");
  let color = "bg-blue-50 text-blue-600 border-blue-200";
  let symbol = "📄";

  if (normalized === "pdf") {
    color = "bg-red-50 text-red-600 border-red-200";
    symbol = "PDF";
  } else if (["docx", "doc", "txt"].includes(normalized)) {
    color = "bg-indigo-50 text-indigo-600 border-indigo-200";
    symbol = "DOC";
  } else if (["xlsx", "xls"].includes(normalized)) {
    color = "bg-emerald-50 text-emerald-600 border-emerald-200";
    symbol = "XLS";
  }

  return (
    <div className={`w-10 h-10 shrink-0 rounded-lg border ${color} flex flex-col items-center justify-center text-[10px] font-bold shadow-xs`}>
      <span className="text-base leading-none select-none">
        {normalized === "pdf" ? "📕" : normalized === "xlsx" || normalized === "xls" ? "📗" : "📘"}
      </span>
      <span className="text-[7px] uppercase mt-0.5 tracking-wider">{symbol}</span>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  let color = "bg-red-50 border-red-200 text-red-700";
  if (pct >= 85) {
    color = "bg-green-50 border-green-200 text-green-700";
  } else if (pct >= 70) {
    color = "bg-yellow-50 border-yellow-200 text-yellow-700";
  }

  return (
    <div className={`flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>
      <span>Match:</span>
      <span className="font-mono">{pct}%</span>
    </div>
  );
}

export default function DocsManagementSearch() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [docType, setDocType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<DocumentRow[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<{ id: string; folder: string; subject: string }[]>([]);

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const queryString = buildQuery(text, docType, dateFrom, dateTo);
  const [aiConfig, setAiConfig] = useState<any>(null);

  useEffect(() => {
    loadCases();
    invoke<any>("get_ai_settings").then(setAiConfig).catch(() => { });
  }, []);

  const showWarning = aiConfig ? (aiConfig.ai_mode === "byom" && !aiConfig.api_key_enc) : !apiKey;

  async function loadCases() {
    try {
      const res = await invoke<any[]>("list_cases");
      setCases(res.map(c => ({
        id: String(c.id),
        folder: c.folder,
        subject: c.subject,
      })));
    } catch (err) {
      console.error("Failed to load cases in search:", err);
    }
  }

  function findCaseForFile(filePath: string) {
    if (!filePath) return null;
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    const matchedCases = cases.filter(c => {
      if (!c.folder) return false;
      const normalizedFolder = c.folder.replace(/\\/g, "/");
      return normalizedFilePath === normalizedFolder || normalizedFilePath.startsWith(normalizedFolder + "/");
    });
    if (matchedCases.length === 1) {
      return matchedCases[0];
    }
    return null;
  }

  async function handleOpenFile(path: string) {
    try {
      await invoke("open_path", { path });
    } catch (e) {
      console.error("Failed to open file:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function handleSearch() {
    if (!queryString.trim() || showWarning) return;
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

  function handleClearFilters() {
    setDocType("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-2 animate-fade-in">
      {/* Enterprise Search Box */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-3">
        <div className="relative flex items-center">
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
            className="absolute left-3.5 text-muted-foreground"
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
            className="w-full rounded-lg border border-input bg-background pl-11 pr-24 py-3 text-sm placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all flex items-center gap-1 ${
                showFilters || docType || dateFrom || dateTo
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              Filters
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Button
              onClick={handleSearch}
              disabled={!queryString.trim() || showWarning || isSearching}
              size="sm"
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {showFilters && (
          <div className="pt-3 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs animate-fade-in-down">
            <div className="flex items-center gap-2">
              <label className="font-semibold text-muted-foreground">Doc Type:</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="font-semibold text-muted-foreground">From:</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="font-semibold text-muted-foreground">To:</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {(docType || dateFrom || dateTo) && (
              <button
                onClick={handleClearFilters}
                className="text-red-500 font-semibold hover:underline ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error Output */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          <span className="font-bold">Search Error: </span>
          {error}
        </div>
      )}

      {/* No API key hint */}
      {showWarning && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
          No API key is configured. Please navigate to the settings page to connect your AI credentials.
        </div>
      )}

      {/* Search Results */}
      {results !== null ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {results.length === 0
                ? "No matching documents found."
                : `Showing ${results.length} relevant document${results.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          <div className="space-y-3">
            {results.map((doc) => {
              const fileExtension = doc.file_name.split(".").pop() || "";
              const matchedCase = findCaseForFile(doc.file_path);
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-border bg-card p-4 hover:shadow-xs transition-all duration-200 flex items-start gap-4 hover:border-border-hover"
                >
                  {/* File Type Icon */}
                  <FileIcon ext={fileExtension} />

                  {/* Document details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Header: Name, Doc Type, Lang, Confidence */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span
                          onClick={() => handleOpenFile(doc.file_path)}
                          className="font-mono text-xs font-bold truncate cursor-pointer text-primary hover:underline hover:text-primary/80"
                          title="Click to open file"
                        >
                          {doc.file_name}
                        </span>
                        {doc.doc_type && (
                          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                            {doc.doc_type}
                          </span>
                        )}
                        {doc.language && (
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded border border-border/80 text-muted-foreground">
                            {doc.language}
                          </span>
                        )}
                        {matchedCase && (
                          <button
                            onClick={() => navigate(`/case-management/cases/${matchedCase.id}`)}
                            className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer"
                            title={`Jump to case: ${matchedCase.subject}`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                              <path d="M15 3h6v6" />
                              <path d="M10 14 21 3" />
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            </svg>
                            <span>Go to Case</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.doc_date && (
                          <span className="text-[10px] text-muted-foreground">{doc.doc_date}</span>
                        )}
                        <ConfidenceBadge value={doc.confidence} />
                      </div>
                    </div>

                    {/* Full path */}
                    <p
                      onClick={() => handleOpenFile(doc.file_path)}
                      className="text-[10px] text-muted-foreground truncate font-mono cursor-pointer hover:underline hover:text-foreground"
                      title={doc.file_path}
                    >
                      {doc.file_path}
                    </p>

                    {/* AI Extracted Title */}
                    {doc.title && (
                      <h4 className="text-xs font-bold text-foreground leading-snug">
                        {doc.title}
                      </h4>
                    )}

                    {/* AI Extracted Summary */}
                    {doc.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed bg-muted/20 p-2.5 rounded-lg border border-border/30">
                        {doc.summary}
                      </p>
                    )}

                    {/* Metadata Tag Cloud */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {/* Keywords */}
                      {doc.keywords.slice(0, 5).map((k) => (
                        <span
                          key={k}
                          className="text-[10px] bg-muted/65 border border-border/40 text-foreground/80 rounded-md px-2 py-0.5"
                        >
                          #{k}
                        </span>
                      ))}

                      {/* Topics */}
                      {doc.topics.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] bg-indigo-50/50 border border-indigo-100 text-indigo-700 rounded-md px-2 py-0.5"
                        >
                          🔮 {t}
                        </span>
                      ))}

                      {/* Entities */}
                      {doc.entities.slice(0, 3).map((e) => (
                        <span
                          key={e}
                          className="text-[10px] bg-emerald-50/50 border border-emerald-100 text-emerald-700 rounded-md px-2 py-0.5"
                        >
                          💼 {e}
                        </span>
                      ))}

                      {/* Authors */}
                      {doc.authors.slice(0, 2).map((a) => (
                        <span
                          key={a}
                          className="text-[10px] bg-amber-50/50 border border-amber-100 text-amber-700 rounded-md px-2 py-0.5"
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
      ) : (
        /* Search Landing/Idle State suggestions */
        <div className="text-center py-16 space-y-4 animate-fade-in-up">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground mx-auto">
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
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Ready to Search</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Enter semantic descriptions or keywords to look through your synced knowledge bases.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto pt-2">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block w-full mb-1">
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
                className="px-2.5 py-1 text-[11px] font-semibold border rounded-full bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150"
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
