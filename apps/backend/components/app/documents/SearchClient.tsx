"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@workspace/ui";
import type { SearchResult } from "../../../lib/search/crud";
import { ensureReadPermission, getFileHandle } from "../../../lib/documents/localHandles";

const POPULAR_SEARCHES = ["contract terms", "settlement agreement", "NDA", "invoice"];

// Matches desktop's SmartSearch page: SearchBar panel + idle/results state.
export default function SearchClient({ initialQuery }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  async function handleOpenCaselessResult(documentId: string) {
    setOpenError(null);
    const fileHandle = await getFileHandle(documentId).catch(() => undefined);
    if (!fileHandle || !(await ensureReadPermission(fileHandle).catch(() => false))) {
      setOpenError("Couldn't open the file — reconnect it from Scan & Index.");
      return;
    }
    try {
      const file = await fileHandle.getFile();
      window.open(URL.createObjectURL(file), "_blank");
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
          <ul className="flex flex-col gap-2">
            {results.map((r, i) =>
              r.caseId ? (
                <li key={`${r.documentId}-${i}`}>
                  <Link
                    href={`/app/cases/${r.caseId}`}
                    className="block rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{r.fileName}</p>
                    <p className="text-xs text-muted-foreground mb-1">{r.caseName}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.chunkText}</p>
                  </Link>
                </li>
              ) : (
                <li key={`${r.documentId}-${i}`}>
                  <button
                    onClick={() => handleOpenCaselessResult(r.documentId)}
                    className="block w-full text-left rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{r.fileName}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.chunkText}</p>
                  </button>
                </li>
              )
            )}
          </ul>
        </>
      )}
    </div>
  );
}
