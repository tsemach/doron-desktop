import { invoke } from "@tauri-apps/api/core";

import type { CaseLink, CasePathResolution, CaseSearchFilters, CaseSearchRow } from "./types";

export async function resolveCasesForPaths(paths: string[]): Promise<CasePathResolution[]> {
  return invoke<CasePathResolution[]>("resolve_cases_for_paths", { paths });
}

export async function searchCases(filters: CaseSearchFilters): Promise<CaseSearchRow[]> {
  return invoke<CaseSearchRow[]>("search_cases", {
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    notesContains: filters.notesContains.trim() || undefined,
  });
}

export { forgetRecentCase, getRecentCases, rememberRecentCase } from "./recentCases";
export type { RecentCase } from "./recentCases";

export type { CaseLink, CasePathResolution, CaseSearchFilters, CaseSearchRow };
