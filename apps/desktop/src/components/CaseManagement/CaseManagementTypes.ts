export type CaseStatus = "open" | "in-progress" | "closed" | "followup";

export interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;
  notes?: string;
  tags?: string[];
  followupDate?: string;
}

export interface CaseFile {
  name: string;
  path: string;
  ext: string;
  size_kb: number;
  title?: string;
  notes?: string;
  tags: string[];
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
