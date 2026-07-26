import { useCallback, useEffect, useRef, useState } from "react";

type UseSearchOptions<TReq, TResult> = {
  searchFn: (request: TReq) => Promise<TResult>;
  request: TReq;
  debounceMs?: number;
  minQueryLength?: number;
  getQueryText?: (request: TReq) => string;
  enabled?: boolean;
  shouldClear?: boolean;
};

type UseSearchResult<TResult> = {
  results: TResult | null;
  hasSearched: boolean;
  isSearching: boolean;
  error: string | null;
  search: () => void;
  reset: () => void;
};

export function useSearch<TReq, TResult>({
  searchFn,
  request,
  debounceMs = 300,
  minQueryLength = 2,
  getQueryText,
  enabled = true,
  shouldClear = false,
}: UseSearchOptions<TReq, TResult>): UseSearchResult<TResult> {
  const [results, setResults] = useState<TResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedRequest, setDebouncedRequest] = useState(request);
  const requestIdRef = useRef(0);
  const hasResultsRef = useRef(false);

  const enabledRef = useRef(enabled);
  const searchFnRef = useRef(searchFn);
  const getQueryTextRef = useRef(getQueryText);
  enabledRef.current = enabled;
  searchFnRef.current = searchFn;
  getQueryTextRef.current = getQueryText;

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    hasResultsRef.current = false;
    setResults(null);
    setHasSearched(false);
    setIsSearching(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (shouldClear) {
      reset();
    }
  }, [shouldClear, reset]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedRequest(request), debounceMs);
    return () => window.clearTimeout(timer);
  }, [request, debounceMs]);

  const runSearch = useCallback(
    async (activeRequest: TReq) => {
      if (!enabledRef.current) return;

      const queryText = getQueryTextRef.current?.(activeRequest) ?? "";
      const trimmed = queryText.trim();
      if (trimmed.length > 0 && trimmed.length < minQueryLength) {
        return;
      }

      const currentId = ++requestIdRef.current;
      // Only show a loading state on the first fetch — keep prior results visible during refresh.
      if (!hasResultsRef.current) {
        setIsSearching(true);
      }
      setError(null);

      try {
        const nextResults = await searchFnRef.current(activeRequest);
        if (currentId !== requestIdRef.current) return;
        hasResultsRef.current = true;
        setResults(nextResults);
        setHasSearched(true);
        setError(null);
      } catch (err) {
        if (currentId !== requestIdRef.current) return;
        setError(String(err));
        setHasSearched(true);
      } finally {
        if (currentId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [minQueryLength],
  );

  useEffect(() => {
    void runSearch(debouncedRequest);
  }, [debouncedRequest, runSearch]);

  const search = useCallback(() => {
    void runSearch(request);
  }, [request, runSearch]);

  return { results, hasSearched, isSearching, error, search, reset };
}
