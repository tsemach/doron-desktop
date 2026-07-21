export type CaseStatus = "open" | "waiting" | "followup" | "closed";

export type TagScopeType = "case" | "document" | "app";
export type TagKind = "user" | "system";

// Mirrors the Rust `Tag` struct's wire shape as-is (snake_case) — like `CaseFile`
// below, tag arrays are used directly from invoke() results without a remapping step.
export interface Tag {
  id: number;
  scope_type: TagScopeType;
  scope_value?: string;
  name: string;
  value?: string;
  type: TagKind;
  created_at: string;
  updated_at: string;
}

export interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;
  notes?: string;
  tags: Tag[];
  fields?: Record<string, string>;
}

export interface CaseFile {
  name: string;
  path: string;
  ext: string;
  size_kb: number;
  title?: string;
  notes?: string;
  tags: Tag[];
}

export interface DocTemplate {
  id: number;
  file_name: string;
  file_ext: string;
  file_size_kb: number;
  fields_found: string; // JSON string of array
  uploaded_at: string;
  original_path: string;
  marked_path: string;
  title: string | null;
}

export interface CaseTemplate {
  id: number;
  name: string;
  fields: string; // JSON string of array
  created_at: string;
  doc_template_ids: number[];
}
