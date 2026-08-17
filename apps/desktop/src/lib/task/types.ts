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

// Editable per-case-creation-flow review row, seeded from a selected
// TaskTemplate's items before the case (and its concrete tasks) exist.
// estimateShorthand keeps the raw "3d"/"0.5d"/"4h" text so the user can type
// freely; it's parsed back to (value, unit) only at submit time.
export interface CaseTaskDraft {
  templateItemId: number;
  selected: boolean;
  title: string;
  estimateShorthand: string;
  description: string;
}

// Mirrors the Rust `TaskRow` struct's wire shape as-is (snake_case), same
// convention as `CaseTemplate`/`DocTemplate` — used directly from invoke()
// results without a remapping step.
export interface Task {
  id: number;
  case_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  estimate_value: number | null;
  estimate_unit: EstimateUnit | null;
  due_date: string | null;
  task_template_item_id: number | null;
  created_at: string;
  updated_at: string | null;
  sort_order: number;
}

// Mirrors Rust's TaskWithCaseRow ( #[serde(flatten)] task + case_subject/
// case_name), returned by list_all_tasks for the cross-case dashboard.
export interface TaskWithCase extends Task {
  case_subject: string | null;
  case_name: string;
}
