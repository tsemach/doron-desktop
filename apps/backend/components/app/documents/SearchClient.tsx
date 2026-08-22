"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { SearchResult } from "../../../lib/search/crud";

export default function SearchClient() {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(res.ok ? (data.results as SearchResult[]) : []);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-xl font-bold text-foreground mb-2">{t("nav_documents")}</h1>
      <p className="text-xs text-muted-foreground mb-6">{t("search_note")}</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_placeholder")}
          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
        />
        <Button type="submit" disabled={searching}>
          {t("search_button")}
        </Button>
      </form>

      {searched && results.length === 0 && <p className="text-sm text-muted-foreground">{t("search_no_results")}</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((r, i) => (
            <li key={`${r.documentId}-${i}`}>
              <Link href={`/app/cases/${r.caseId}`} className="block rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted transition-colors">
                <p className="text-sm font-medium text-foreground">{r.fileName}</p>
                <p className="text-xs text-muted-foreground mb-1">{r.caseName}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{r.chunkText}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
