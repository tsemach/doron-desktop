import { useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";

import { searchCases, type CaseSearchFilters, type CaseSearchRow } from "@/lib/case";
import {
  caseSearchCacheAtom,
  readCaseSearchCache,
  stableCaseFiltersKey,
  writeCaseSearchCache,
} from "@/store/caseSearchStore";

type UseCaseSearchOptions = {
  enabled: boolean;
  delayMs?: number;
};

type UseCaseSearchResult = {
  cases: CaseSearchRow[];
  hasSearched: boolean;
  isSearching: boolean;
  error: string | null;
};

export function useCaseSearch(
  filters: CaseSearchFilters,
  { enabled, delayMs = 200 }: UseCaseSearchOptions,
): UseCaseSearchResult {
  const [cases, setCases] = useState<CaseSearchRow[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useAtom(caseSearchCacheAtom);
  const requestIdRef = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const cacheKey = useMemo(
    () => stableCaseFiltersKey(filters.tags, filters.notesContains),
    [filters.notesContains, filters.tags],
  );

  useEffect(() => {
    requestIdRef.current += 1;
    setIsSearching(false);

    if (!enabled) {
      setCases([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    const cached = readCaseSearchCache(cache, cacheKey);
    if (cached) {
      setCases(cached);
      setHasSearched(true);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsSearching(true);
        setError(null);
        try {
          const rows = await searchCases(filtersRef.current);
          if (requestId !== requestIdRef.current) return;
          setCases(rows);
          setHasSearched(true);
          setCache((prev) => writeCaseSearchCache(prev, cacheKey, rows));
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setError(String(err));
          setHasSearched(true);
        } finally {
          if (requestId === requestIdRef.current) {
            setIsSearching(false);
          }
        }
      })();
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cache, cacheKey, delayMs, enabled, setCache]);

  return { cases, hasSearched, isSearching, error };
}
