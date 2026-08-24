"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Search } from "lucide-react";
import { Button } from "@workspace/ui";
import type { SearchResult } from "../../../lib/search/crud";
import { ensureReadPermission, getFileHandle } from "../../../lib/documents/localHandles";
import FileTypeIcon from "./FileTypeIcon";

// rootFolderName is only set for documents from a Scan & Index folder
// scan (see the column comment in packages/backend-orm/src/schema.ts);
// still not a true absolute path -- the browser never exposes anything
// above the picked folder -- but fuller context than relativePath alone.
function fullPath(result: SearchResult): string {
  return result.rootFolderName ? `${result.rootFolderName}/${result.relativePath}` : result.relativePath;
}

const POPULAR_SEARCHES = ["contract terms", "settlement agreement", "NDA", "invoice"];

// Extensions a browser tab can actually render on its own (pdf inline,
// txt as plain text) -- window.open gives a real "view" experience for
// these. Everything else (docx/doc/xlsx/xls/csv) a browser can't
// display, so window.open on a blob URL just triggers a download with a
// blob-derived name; a real <a download> with the true file name is a
// better result for the same outcome.
const BROWSER_VIEWABLE_EXTENSIONS = new Set(["pdf", "txt"]);

function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function confidenceClass(pct: number): string {
  if (pct >= 85) return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50";
  if (pct >= 70) return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50";
  return "bg-muted text-muted-foreground border-border";
}

function MatchBadge({ similarity }: { similarity: number | null }) {
  if (similarity === null) return null;
  const pct = Math.round(similarity * 100);
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceClass(pct)}`}>
      Match: {pct}%
    </span>
  );
}

// The card body it sits in is itself a Link or a button (open the file /
// go to the case) -- stopPropagation+preventDefault so clicking the icon
// copies the path instead of triggering that outer action.
function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied/unavailable -- silently no-op, nothing
      // else useful to do from here.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Copy full path"
      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// Shared by both result branches below. `titleElement` is the
// clickable filename (a Link for a case result, a button for a caseless
// one) -- kept as a sibling of CopyPathButton, not an ancestor, since
// nesting a button/Link inside another interactive element is invalid
// HTML (the whole card used to be the Link/button; that's why the copy
// icon couldn't just be dropped in before). Mirrors desktop's
// DocumentResultItem: icon, name + match badge, full path, content
// preview. No doc-type/language badges or entity chips -- those come
// from a metadata-extraction pass the backend doesn't have.
function ResultCardBody({ result, caseName, titleElement }: { result: SearchResult; caseName?: string | null; titleElement: React.ReactNode }) {
  return (
    <>
      <FileTypeIcon ext={fileExtension(result.fileName)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {titleElement}
            <CopyPathButton path={fullPath(result)} />
          </div>
          <MatchBadge similarity={result.similarity} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{caseName ?? fullPath(result)}</p>
        <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground line-clamp-2">{result.chunkText}</p>
      </div>
    </>
  );
}

// Matches desktop's SmartSearch page: SearchBar panel + idle/results state.
export default function SearchClient({ initialQuery }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // A browser page can't launch the OS's default app for a file the way
  // desktop's invoke("open_path") does -- that's a native OS call only a
  // real backend process can make, not something JS running in a page is
  // ever allowed to do. This is the closest a browser gets: a type it can
  // render (pdf/txt) opens in a new tab; everything else downloads under
  // its real name, for the user to open from Downloads themselves.
  async function handleOpenCaselessResult(documentId: string, fileName: string) {
    setOpenError(null);
    const fileHandle = await getFileHandle(documentId).catch(() => undefined);
    if (!fileHandle || !(await ensureReadPermission(fileHandle).catch(() => false))) {
      setOpenError("Couldn't open the file — reconnect it from Scan & Index.");
      return;
    }
    try {
      const file = await fileHandle.getFile();
      const url = URL.createObjectURL(file);
      if (BROWSER_VIEWABLE_EXTENSIONS.has(fileExtension(fileName))) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setOpenError("Couldn't open the file — it may have moved or been renamed.");
    }
  }

  async function runSearch(q: string) {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(res.ok ? (data.results as SearchResult[]) : []);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  // Auto-runs once when arriving with a pre-filled query (e.g. from Home's
  // search box), mirroring desktop's navigate-with-state-then-search flow.
  useEffect(() => {
    if (initialQuery?.trim()) {
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  function handleSuggestionClick(suggestion: string) {
    setQuery(suggestion);
    runSearch(suggestion);
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card shadow-sm p-4">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents using natural language (Hebrew / English)…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <Button type="submit" disabled={searching}>
            Search
          </Button>
        </div>
      </form>

      {!searched ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-muted/50">
            <Search className="size-6 text-muted-foreground" />
          </span>
          <h2 className="text-sm font-bold text-foreground">Ready to Search</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Enter semantic descriptions or keywords to look through your indexed documents. Only .txt, .docx, and .pdf files are
            indexed for search in this version.
          </p>
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Popular Searches</p>
            <div className="flex flex-wrap justify-center gap-2">
              {POPULAR_SEARCHES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                >
                  &quot;{s}&quot;
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : results.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No results found.</p>
      ) : (
        <>
          {openError && <p className="text-center text-sm text-destructive">{openError}</p>}
          <ul className="flex flex-col gap-3">
            {results.map((r, i) => (
              <li key={`${r.documentId}-${i}`} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                {r.caseId ? (
                  <ResultCardBody
                    result={r}
                    caseName={r.caseName}
                    titleElement={
                      <Link href={`/app/cases/${r.caseId}`} className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate hover:underline">
                        {r.fileName}
                      </Link>
                    }
                  />
                ) : (
                  <ResultCardBody
                    result={r}
                    titleElement={
                      <button
                        type="button"
                        onClick={() => handleOpenCaselessResult(r.documentId, r.fileName)}
                        className="min-w-0 flex-1 text-left text-sm font-semibold text-foreground truncate hover:underline"
                      >
                        {r.fileName}
                      </button>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
