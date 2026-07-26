/** Mirrors Rust `query::types::DocumentRow` (indexed document metadata). */
export type DocumentRow = {
  id: number;
  file_path: string;
  file_name: string;
  title: string | null;
  summary: string | null;
  doc_type: string | null;
  doc_date: string | null;
  language: string | null;
  keywords: string[];
  topics: string[];
  entities: string[];
  authors: string[];
  page_count: number | null;
  confidence: number | null;
};
