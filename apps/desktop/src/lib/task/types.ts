export type TaskStatus = "Waiting" | "In progress" | "Cancel" | "Done";

export type EstimateUnit = "day" | "hour";

export interface TaskTemplateItem {
  id: number;
  title: string;
  estimate_value: number;
  estimate_unit: EstimateUnit;
  description: string | null;
}

export interface TaskTemplate {
  id: number;
  name: string;
  created_at: string;
  items: TaskTemplateItem[];
}

// Shape used by the template-item editor forms (create form, inline "add task"
// in the details view) before a title/estimate has been persisted as a
// TaskTemplateItem — no `id` yet, and the estimate is already parsed.
export interface TaskTemplateItemDraft {
  title: string;
  estimateValue: number;
  estimateUnit: EstimateUnit;
  description: string;
}
