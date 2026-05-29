export type TemplateRow = {
  id: number;
  file_name: string;
  file_ext: string;
  file_size_kb: number;
  fields_found: string;
  uploaded_at: string;
  original_path: string;
  marked_path: string;
};

export type TemplateResult = {
  id: number;
  marked_path: string;
  fields_found: string[];
};

export type ProcessingState = {
  status: "processing" | "ok" | "failed";
  message: string;
} | null;

export type TemplateProgressEvent = {
  status: string;
  message: string;
};
