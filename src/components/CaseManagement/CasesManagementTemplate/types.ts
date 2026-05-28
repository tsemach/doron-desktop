export interface DocTemplate {
  id: number;
  file_name: string;
  file_ext: string;
  fields_found: string; // JSON string of array
  uploaded_at: string;
  title: string | null;
}

export interface CaseTemplate {
  id: number;
  name: string;
  fields: string; // JSON string of array
  created_at: string;
  doc_template_ids: number[];
}
