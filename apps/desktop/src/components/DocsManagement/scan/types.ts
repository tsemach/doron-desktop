export type ProgressStatus = "processing" | "ok" | "skipped" | "failed";

export type ProgressItem = {
  file_name: string;
  status: ProgressStatus;
  message: string;
  current: number;
  total: number;
};

export type IndexSummary = {
  indexed: number;
  skipped: number;
  failed: number;
};

export interface IndexingSession {
  path: string;
  is_folder: boolean;
  reindex: boolean;
  start_index: number;
  total_files: number;
  status: string;
  updated_at: string;
}
