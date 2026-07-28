import type { TagFilter } from "@/lib/search";

export type DocumentSearchTarget = "documents" | "cases" | "both";

export type DocumentSearchAdvancedFilters = {
  docType: string;
  dateFrom: string;
  dateTo: string;
  tagFilters: TagFilter[];
  notesContains: string;
  searchTarget: DocumentSearchTarget;
};

export const defaultDocumentSearchAdvancedFilters: DocumentSearchAdvancedFilters = {
  docType: "",
  dateFrom: "",
  dateTo: "",
  tagFilters: [],
  notesContains: "",
  searchTarget: "documents",
};
