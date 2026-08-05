import { Task } from "@/lib/task/types";

export enum TaskListActionType {
  LOAD_START = "LOAD_START",
  LOAD_SUCCESS = "LOAD_SUCCESS",
  LOAD_FAILURE = "LOAD_FAILURE",
  SET_EDITING_TASK = "SET_EDITING_TASK",
  SET_PENDING_DELETE_ID = "SET_PENDING_DELETE_ID",
}

// editingTask: "new" opens the create form, a Task opens that task's edit
// form, null means no form is open.
//
// Generic over T extends Task so the same state shape serves both a plain
// case-scoped Task list (CaseTasksPanel) and the dashboard's TaskWithCase
// list (list_all_tasks) without duplicating this reducer.
export interface TaskListState<T extends Task = Task> {
  tasks: T[];
  loading: boolean;
  error: string | null;
  editingTask: T | "new" | null;
  pendingDeleteId: number | null;
}

export type TaskListAction<T extends Task = Task> =
  | { type: TaskListActionType.LOAD_START }
  | { type: TaskListActionType.LOAD_SUCCESS; payload: T[] }
  | { type: TaskListActionType.LOAD_FAILURE; payload: string }
  | { type: TaskListActionType.SET_EDITING_TASK; payload: T | "new" | null }
  | { type: TaskListActionType.SET_PENDING_DELETE_ID; payload: number | null };

export function createInitialTaskListState<T extends Task = Task>(): TaskListState<T> {
  return { tasks: [], loading: true, error: null, editingTask: null, pendingDeleteId: null };
}

export function taskListReducer<T extends Task = Task>(
  state: TaskListState<T>,
  action: TaskListAction<T>
): TaskListState<T> {
  switch (action.type) {
    case TaskListActionType.LOAD_START:
      return { ...state, loading: true, error: null };
    case TaskListActionType.LOAD_SUCCESS:
      return { ...state, loading: false, tasks: action.payload };
    case TaskListActionType.LOAD_FAILURE:
      return { ...state, loading: false, error: action.payload };
    case TaskListActionType.SET_EDITING_TASK:
      return { ...state, editingTask: action.payload };
    case TaskListActionType.SET_PENDING_DELETE_ID:
      return { ...state, pendingDeleteId: action.payload };
    default:
      return state;
  }
}
