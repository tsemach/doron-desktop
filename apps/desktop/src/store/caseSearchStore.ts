import { atom } from "jotai";

import type { CaseLink, CaseSearchRow } from "@/lib/case";

export function stablePathsKey(paths: string[]): string {
  return [...paths].sort().join("\0");
}

export function stableCaseFiltersKey(tags: { name: string; value?: string }[], notesContains: string): string {
  const normalizedTags = [...tags]
    .map((tag) => ({ name: tag.name, value: tag.value ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value));
  return JSON.stringify({ tags: normalizedTags, notes: notesContains.trim() });
}

type CaseLinksCache = Map<string, Map<string, CaseLink>>;
type CaseSearchCache = Map<string, CaseSearchRow[]>;

export const caseLinksCacheAtom = atom<CaseLinksCache>(new Map());
export const caseSearchCacheAtom = atom<CaseSearchCache>(new Map());

export function readCaseLinksCache(cache: CaseLinksCache, key: string): Map<string, CaseLink> | undefined {
  return cache.get(key);
}

export function writeCaseLinksCache(cache: CaseLinksCache, key: string, links: Map<string, CaseLink>): CaseLinksCache {
  const next = new Map(cache);
  next.set(key, links);
  return next;
}

export function readCaseSearchCache(cache: CaseSearchCache, key: string): CaseSearchRow[] | undefined {
  return cache.get(key);
}

export function writeCaseSearchCache(cache: CaseSearchCache, key: string, rows: CaseSearchRow[]): CaseSearchCache {
  const next = new Map(cache);
  next.set(key, rows);
  return next;
}
