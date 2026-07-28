import { invoke } from "@tauri-apps/api/core";

import type { DocumentSearchRequest, SearchResponse } from "./types";

export async function searchDocuments(request: DocumentSearchRequest): Promise<SearchResponse> {
  return invoke<SearchResponse>("search", {
    request: {
      scope: "documents",
      query: request.query,
      limit: request.limit ?? 20,
      filters: {
        tags: request.tags,
        notesContains: request.notesContains,
      },
    },
  });
}
