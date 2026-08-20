import { CaseTemplate, DocTemplate } from "@/components/CaseManagement/CaseManagementTypes";
import { CaseTaskDraft, TaskTemplate } from "@/lib/task/types";
import { formatEstimateShorthand } from "@/lib/task/estimate";

export const FOLDER_IN_USE_ERROR = "A case with this storage directory path already exists.";

export const EMPTY_TEMPLATE_ID = "empty";

export enum CaseCreateActionType {
  SET_SUBJECT = "SET_SUBJECT",
  SET_NAME = "SET_NAME",
  SET_ORGANIZATION = "SET_ORGANIZATION",
  SET_CONTACT_EMAILS = "SET_CONTACT_EMAILS",
  SET_CASE_TYPE = "SET_CASE_TYPE",
  SET_FOLDER = "SET_FOLDER",
  SELECT_TEMPLATE = "SELECT_TEMPLATE",
  SELECT_TASK_TEMPLATE = "SELECT_TASK_TEMPLATE",
  UPDATE_TASK_DRAFT = "UPDATE_TASK_DRAFT",
  TEMPLATES_LOADED = "TEMPLATES_LOADED",
  SET_FIELD_VALUES = "SET_FIELD_VALUES",
  SET_SEARCH_QUERY = "SET_SEARCH_QUERY",
  SET_SELECTED_ROW = "SET_SELECTED_ROW",
  SET_FILTER_DOC_ID = "SET_FILTER_DOC_ID",
  SET_FOCUSED_FIELD = "SET_FOCUSED_FIELD",
  FOCUS_FIELD_FROM_PREVIEW = "FOCUS_FIELD_FROM_PREVIEW",
  SET_SHOW_ALL_PREVIEWS = "SET_SHOW_ALL_PREVIEWS",
  SET_EXPANDED_DOC_ID = "SET_EXPANDED_DOC_ID",
  PREVIEW_LOAD_START = "PREVIEW_LOAD_START",
  PREVIEW_LOAD_SUCCESS = "PREVIEW_LOAD_SUCCESS",
  PREVIEW_LOAD_FAILURE = "PREVIEW_LOAD_FAILURE",
  SET_LOADING = "SET_LOADING",
  SET_ERROR = "SET_ERROR",
  CLEAR_FOLDER_IN_USE_ERROR = "CLEAR_FOLDER_IN_USE_ERROR",
  SET_IS_LG_SCREEN = "SET_IS_LG_SCREEN",
}

export interface CaseCreateState {
  // Main case details
  subject: string;
  name: string;
  organization: string;
  contactEmails: string[];
  caseType: string;
  folder: string;
  selectedTemplateId: string;
  selectedTaskTemplateId: string;

  // Templates loaded from SQLite
  templates: CaseTemplate[];
  docTemplates: DocTemplate[];
  taskTemplates: TaskTemplate[];

  // Editable review rows for the selected task template's items -- the user
  // can uncheck/edit any of these before the case (and its tasks) are created.
  taskDrafts: CaseTaskDraft[];

  // Template field entry and filtering
  fieldValues: Record<string, string>;
  searchQuery: string;
  selectedRow: number | null;
  filterDocId: number | null;
  focusedField: string | null;

  // Document preview drawer
  showAllPreviews: boolean;
  expandedDocId: number | null;
  docHtmlCache: Record<number, string>;
  previewError: string | null;
  loadingContext: boolean;

  // Submission
  loading: boolean;
  error: string | null;

  // Split-pane layout — the divider position and drag state live in
  // useSplitPane; only the breakpoint flag is still reducer state.
  isLgScreen: boolean;
}

export type CaseCreateAction =
  | { type: CaseCreateActionType.SET_SUBJECT; payload: string }
  | { type: CaseCreateActionType.SET_NAME; payload: string }
  | { type: CaseCreateActionType.SET_ORGANIZATION; payload: string }
  | { type: CaseCreateActionType.SET_CONTACT_EMAILS; payload: string[] }
  | { type: CaseCreateActionType.SET_CASE_TYPE; payload: string }
  | { type: CaseCreateActionType.SET_FOLDER; payload: string }
  | { type: CaseCreateActionType.SELECT_TEMPLATE; payload: string }
  | { type: CaseCreateActionType.SELECT_TASK_TEMPLATE; payload: string }
  | { type: CaseCreateActionType.UPDATE_TASK_DRAFT; payload: { index: number; patch: Partial<CaseTaskDraft> } }
  | {
      type: CaseCreateActionType.TEMPLATES_LOADED;
      payload: { templates: CaseTemplate[]; docTemplates: DocTemplate[]; taskTemplates: TaskTemplate[] };
    }
  | { type: CaseCreateActionType.SET_FIELD_VALUES; payload: Record<string, string> }
  | { type: CaseCreateActionType.SET_SEARCH_QUERY; payload: string }
  | { type: CaseCreateActionType.SET_SELECTED_ROW; payload: number | null }
  | { type: CaseCreateActionType.SET_FILTER_DOC_ID; payload: number | null }
  | { type: CaseCreateActionType.SET_FOCUSED_FIELD; payload: string | null }
  | {
      type: CaseCreateActionType.FOCUS_FIELD_FROM_PREVIEW;
      payload: { field: string; resetFilters: boolean };
    }
  | { type: CaseCreateActionType.SET_SHOW_ALL_PREVIEWS; payload: boolean }
  | { type: CaseCreateActionType.SET_EXPANDED_DOC_ID; payload: number | null }
  | { type: CaseCreateActionType.PREVIEW_LOAD_START }
  | { type: CaseCreateActionType.PREVIEW_LOAD_SUCCESS; payload: { docId: number; html: string } }
  | { type: CaseCreateActionType.PREVIEW_LOAD_FAILURE; payload: string }
  | { type: CaseCreateActionType.SET_LOADING; payload: boolean }
  | { type: CaseCreateActionType.SET_ERROR; payload: string | null }
  | { type: CaseCreateActionType.CLEAR_FOLDER_IN_USE_ERROR }
  | { type: CaseCreateActionType.SET_IS_LG_SCREEN; payload: boolean };

export function parseTemplateFields(template: CaseTemplate | undefined): string[] {
  if (!template) return [];
  try {
    const parsed = JSON.parse(template.fields);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse template fields:", e);
    return [];
  }
}

export function createInitialCaseCreateState(): CaseCreateState {
  return {
    subject: "",
    name: "",
    organization: "",
    contactEmails: [],
    caseType: "",
    folder: "",
    selectedTemplateId: EMPTY_TEMPLATE_ID,
    selectedTaskTemplateId: EMPTY_TEMPLATE_ID,
    templates: [],
    docTemplates: [],
    taskTemplates: [],
    taskDrafts: [],
    fieldValues: {},
    searchQuery: "",
    selectedRow: null,
    filterDocId: null,
    focusedField: null,
    showAllPreviews: false,
    expandedDocId: null,
    docHtmlCache: {},
    previewError: null,
    loadingContext: false,
    loading: false,
    error: null,
    isLgScreen: window.innerWidth >= 1024,
  };
}

export function caseCreateReducer(state: CaseCreateState, action: CaseCreateAction): CaseCreateState {
  switch (action.type) {
    case CaseCreateActionType.SET_SUBJECT:
      return { ...state, subject: action.payload };
    case CaseCreateActionType.SET_NAME:
      return { ...state, name: action.payload };
    case CaseCreateActionType.SET_ORGANIZATION:
      return { ...state, organization: action.payload };
    case CaseCreateActionType.SET_CONTACT_EMAILS:
      return { ...state, contactEmails: action.payload };
    case CaseCreateActionType.SET_CASE_TYPE:
      return { ...state, caseType: action.payload };
    case CaseCreateActionType.SET_FOLDER:
      return { ...state, folder: action.payload };

    // Switching template blanks out every field the previous template drove:
    // values, filters, focus and the cached previews all belong to that template.
    case CaseCreateActionType.SELECT_TEMPLATE: {
      const template = state.templates.find((t) => String(t.id) === action.payload);
      const fieldValues: Record<string, string> = {};
      parseTemplateFields(template).forEach((field) => {
        fieldValues[field] = "";
      });

      return {
        ...state,
        selectedTemplateId: action.payload,
        fieldValues,
        searchQuery: "",
        filterDocId: null,
        selectedRow: null,
        focusedField: null,
        showAllPreviews: false,
        expandedDocId: null,
        docHtmlCache: {},
        previewError: null,
      };
    }

    // Unlike a case template's document field values, a task template has no
    // dynamic fields to reset -- but it does seed the editable review rows
    // (all selected by default) that the case-creation UI shows before the
    // case exists, so the user can uncheck/edit any task before submitting.
    case CaseCreateActionType.SELECT_TASK_TEMPLATE: {
      const template = state.taskTemplates.find((t) => String(t.id) === action.payload);
      const taskDrafts: CaseTaskDraft[] = (template?.items ?? []).map((item) => ({
        templateItemId: item.id,
        selected: true,
        title: item.title,
        estimateShorthand: formatEstimateShorthand(item.estimate_value, item.estimate_unit),
        description: item.description ?? "",
      }));

      return { ...state, selectedTaskTemplateId: action.payload, taskDrafts };
    }

    case CaseCreateActionType.UPDATE_TASK_DRAFT:
      return {
        ...state,
        taskDrafts: state.taskDrafts.map((draft, i) =>
          i === action.payload.index ? { ...draft, ...action.payload.patch } : draft
        ),
      };

    case CaseCreateActionType.TEMPLATES_LOADED:
      return {
        ...state,
        templates: action.payload.templates,
        docTemplates: action.payload.docTemplates,
        taskTemplates: action.payload.taskTemplates,
      };

    case CaseCreateActionType.SET_FIELD_VALUES:
      return { ...state, fieldValues: action.payload };
    case CaseCreateActionType.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload };
    case CaseCreateActionType.SET_SELECTED_ROW:
      return { ...state, selectedRow: action.payload };
    case CaseCreateActionType.SET_FILTER_DOC_ID:
      return { ...state, filterDocId: action.payload };
    case CaseCreateActionType.SET_FOCUSED_FIELD:
      return { ...state, focusedField: action.payload };

    case CaseCreateActionType.FOCUS_FIELD_FROM_PREVIEW:
      return {
        ...state,
        ...(action.payload.resetFilters
          ? { searchQuery: "", selectedRow: null, filterDocId: null }
          : {}),
        focusedField: action.payload.field,
        showAllPreviews: false,
      };

    case CaseCreateActionType.SET_SHOW_ALL_PREVIEWS:
      return { ...state, showAllPreviews: action.payload };
    case CaseCreateActionType.SET_EXPANDED_DOC_ID:
      return { ...state, expandedDocId: action.payload };

    case CaseCreateActionType.PREVIEW_LOAD_START:
      return { ...state, loadingContext: true, previewError: null };
    case CaseCreateActionType.PREVIEW_LOAD_SUCCESS:
      return {
        ...state,
        loadingContext: false,
        docHtmlCache: { ...state.docHtmlCache, [action.payload.docId]: action.payload.html },
      };
    case CaseCreateActionType.PREVIEW_LOAD_FAILURE:
      return { ...state, loadingContext: false, previewError: action.payload };

    case CaseCreateActionType.SET_LOADING:
      return { ...state, loading: action.payload };
    case CaseCreateActionType.SET_ERROR:
      return { ...state, error: action.payload };

    // Only retracts the folder-conflict message, so a submit/browse error raised
    // meanwhile isn't wiped by a stale folder check resolving afterwards.
    case CaseCreateActionType.CLEAR_FOLDER_IN_USE_ERROR:
      return state.error === FOLDER_IN_USE_ERROR ? { ...state, error: null } : state;

    case CaseCreateActionType.SET_IS_LG_SCREEN:
      return { ...state, isLgScreen: action.payload };

    default:
      return state;
  }
}
