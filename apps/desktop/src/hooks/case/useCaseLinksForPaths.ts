import { useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";

import { resolveCasesForPaths, type CaseLink } from "@/lib/case";
import {
  caseLinksCacheAtom,
  readCaseLinksCache,
  stablePathsKey,
  writeCaseLinksCache,
} from "@/store/caseSearchStore";

type UseCaseLinksForPathsOptions = {
  isSearching: boolean;
  delayMs?: number;
};

type UseCaseLinksForPathsResult = {
  links: Map<string, CaseLink>;
  isResolving: boolean;
  error: string | null;
};

function toLinksMap(resolutions: Awaited<ReturnType<typeof resolveCasesForPaths>>): Map<string, CaseLink> {
  const map = new Map<string, CaseLink>();
  for (const row of resolutions) {
    if (!row.case_link) continue;
    map.set(row.path, {
      id: String(row.case_link.id),
      subject: row.case_link.subject ?? "Untitled Case",
    });
  }
  return map;
}

export function useCaseLinksForPaths(
  filePaths: string[],
  { isSearching, delayMs = 200 }: UseCaseLinksForPathsOptions,
): UseCaseLinksForPathsResult {
  const [links, setLinks] = useState<Map<string, CaseLink>>(new Map());
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useAtom(caseLinksCacheAtom);
  const requestIdRef = useRef(0);

  const cacheKey = useMemo(() => (filePaths.length > 0 ? stablePathsKey(filePaths) : ""), [filePaths]);

  useEffect(() => {
    requestIdRef.current += 1;
    setIsResolving(false);

    if (isSearching || filePaths.length === 0) {
      if (filePaths.length === 0) {
        setLinks(new Map());
        setError(null);
      }
      return;
    }

    const cached = cacheKey ? readCaseLinksCache(cache, cacheKey) : undefined;
    if (cached) {
      setLinks(cached);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setIsResolving(true);
        setError(null);
        try {
          const resolutions = await resolveCasesForPaths(filePaths);
          if (requestId !== requestIdRef.current) return;
          const nextLinks = toLinksMap(resolutions);
          setLinks(nextLinks);
          if (cacheKey) {
            setCache((prev) => writeCaseLinksCache(prev, cacheKey, nextLinks));
          }
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setError(String(err));
        } finally {
          if (requestId === requestIdRef.current) {
            setIsResolving(false);
          }
        }
      })();
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cache, cacheKey, delayMs, filePaths, isSearching, setCache]);

  return { links, isResolving, error };
}
