import type { DocumentRow } from "../documents/types";

export type SearchScope = "documents";

/** Mirrors Rust `query::types::TagFilter` — search filter input, not a stored tag. */
export type TagFilter = {
  name: string;
  value?: string;
};

export type SearchFilters = {
  tags?: TagFilter[];
  notesContains?: string;
};

export type SearchRequest = {
  scope: SearchScope;
  query: string;
  limit?: number;
  filters?: SearchFilters;
};

export type SearchResponse = {
  scope: SearchScope;
  results: DocumentRow[];
  total: number;
};

export type DocumentSearchRequest = {
  query: string;
  apiKey: string;
  limit?: number;
  tags?: TagFilter[];
  notesContains?: string;
};
