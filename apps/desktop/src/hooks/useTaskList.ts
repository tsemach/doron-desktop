import { useCallback, useEffect, useReducer, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task, TaskStatus } from "@/lib/task/types";
import {
  taskListReducer,
  createInitialTaskListState,
  TaskListActionType,
} from "@/reducers/task-list.reducer";

/// Shared list/mutation state for any Task view (case-scoped tab, global
/// dashboard). `dependencyKey` identifies what's being fetched (e.g. a case
/// id) -- when it changes, the list reloads; `fetchTasks` itself doesn't need
/// referential stability since it's only ever read through a ref.
///
/// Only reuses the mutations that need no extra context beyond a task id
/// (status change, delete). Create/full-edit calls create_task/update_task
/// directly with whatever extra context it has (e.g. a case_id) and then
/// calls `reload()` + `closeForm()` itself.
///
/// Generic over T extends Task: CaseTasksPanel uses the default (plain
/// Task from list_tasks_for_case), the dashboard instantiates it with
/// TaskWithCase (list_all_tasks) to keep case_subject/case_name on each row.
export function useTaskList<T extends Task = Task>(fetchTasks: () => Promise<T[]>, dependencyKey: string | number) {
  const [state, dispatch] = useReducer(taskListReducer<T>, undefined, createInitialTaskListState<T>);
  const fetchRef = useRef(fetchTasks);
  fetchRef.current = fetchTasks;

  const reload = useCallback(async () => {
    dispatch({ type: TaskListActionType.LOAD_START });
    try {
      const tasks = await fetchRef.current();
      dispatch({ type: TaskListActionType.LOAD_SUCCESS, payload: tasks });
    } catch (err) {
      console.error(err);
      dispatch({ type: TaskListActionType.LOAD_FAILURE, payload: "Failed to load tasks." });
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependencyKey]);

  const changeStatus = useCallback(async (id: number, status: TaskStatus) => {
    try {
      await invoke("update_task_status", { id, status });
      dispatch({ type: TaskListActionType.UPDATE_TASK_STATUS, payload: { id, status } });
    } catch (err) {
      alert(`Error updating task status: ${err}`);
    }
  }, []);

  const removeTask = useCallback(async (id: number) => {
    try {
      await invoke("delete_task", { id });
      await reload();
    } catch (err) {
      alert(`Error deleting task: ${err}`);
    }
  }, [reload]);

  const startCreate = useCallback(() => {
    dispatch({ type: TaskListActionType.SET_EDITING_TASK, payload: "new" });
  }, []);

  const startEdit = useCallback((task: T) => {
    dispatch({ type: TaskListActionType.SET_EDITING_TASK, payload: task });
  }, []);

  const closeForm = useCallback(() => {
    dispatch({ type: TaskListActionType.SET_EDITING_TASK, payload: null });
  }, []);

  const setPendingDelete = useCallback((id: number | null) => {
    dispatch({ type: TaskListActionType.SET_PENDING_DELETE_ID, payload: id });
  }, []);

  return {
    tasks: state.tasks,
    loading: state.loading,
    error: state.error,
    editingTask: state.editingTask,
    pendingDeleteId: state.pendingDeleteId,
    reload,
    changeStatus,
    removeTask,
    startCreate,
    startEdit,
    closeForm,
    setPendingDelete,
  };
}
