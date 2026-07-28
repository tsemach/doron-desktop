export type CaseLink = {
  id: string;
  subject: string;
};

export type CasePathResolution = {
  path: string;
  case_link: CaseLink | null;
};

export type CaseSearchRow = {
  id: number;
  subject: string | null;
  status: string;
  folder: string | null;
};

export type CaseSearchFilters = {
  tags: { name: string; value?: string }[];
  notesContains: string;
};
