import { useEffect, useMemo, useCallback, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Case, CaseTemplate, DocTemplate } from "./CaseManagementTypes";
import { TaskTemplate } from "@/lib/task/types";
import { parseEstimateShorthand } from "@/lib/task/estimate";
import mammoth from "mammoth";
import CaseManagementCaseCreateForm from "./CaseManagementCaseCreateForm";
import CaseManagementCaseCreateFormActions from "./CaseManagementCaseCreateFormActions";
import CaseManagementCaseCreateTemplateFields from "./CaseManagementCaseCreateTemplateFields";
import CaseManagementCaseCreateTaskReview from "./CaseManagementCaseCreateTaskReview";
import CaseTemplateHelp from "./CaseTemplateHelp";
import { useRowFields } from "@/hooks/useRowFields";
import { useSplitPane } from "@/hooks/useSplitPane";
import {
  caseCreateReducer,
  createInitialCaseCreateState,
  parseTemplateFields,
  CaseCreateActionType,
  EMPTY_TEMPLATE_ID,
  FOLDER_IN_USE_ERROR,
} from "@/reducers/case-create.reducer";


export default function CaseManagementCaseCreate() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(caseCreateReducer, undefined, createInitialCaseCreateState);
  const [templateHelpOpen, setTemplateHelpOpen] = useState(false);
  const [activeRightView, setActiveRightView] = useState<"help" | "caseTemplate" | "taskTemplate" | null>(null);

  const {
    subject,
    name,
    organization,
    folder,
    selectedTemplateId,
    selectedTaskTemplateId,
    templates,
    docTemplates,
    taskTemplates,
    taskDrafts,
    fieldValues,
    searchQuery,
    selectedRow,
    filterDocId,
    focusedField,
    showAllPreviews,
    expandedDocId,
    docHtmlCache,
    previewError,
    loadingContext,
    loading,
    error,
    isLgScreen,
  } = state;

  const isCaseTemplateSelected = selectedTemplateId !== EMPTY_TEMPLATE_ID;
  const isTaskTemplateSelected = selectedTaskTemplateId !== EMPTY_TEMPLATE_ID;

  // Automatically update active view when selections or help change
  useEffect(() => {
    if (templateHelpOpen) {
      setActiveRightView("help");
    } else if (isCaseTemplateSelected && activeRightView !== "taskTemplate") {
      setActiveRightView("caseTemplate");
    } else if (isTaskTemplateSelected && activeRightView !== "caseTemplate") {
      setActiveRightView("taskTemplate");
    } else if (!isCaseTemplateSelected && !isTaskTemplateSelected) {
      setActiveRightView(null);
    }
  }, [templateHelpOpen, isCaseTemplateSelected, isTaskTemplateSelected]);

  const {
    percent: leftPercent,
    isDragging,
    startDragging,
  } = useSplitPane({
    containerId: "create-case-split-container",
    initialPercent: 36,
    minPercent: 25,
    maxPercent: 75,
  });

  const {
    percent: bottomPercent,
    isDragging: isDraggingHeight,
    startDragging: startDraggingHeight,
  } = useSplitPane({
    containerId: "right-fields-container",
    initialPercent: 55,
    minPercent: 15,
    maxPercent: 65,
    axis: "vertical",
  });

  useEffect(() => {
    const handleResize = () => {
      dispatch({
        type: CaseCreateActionType.SET_IS_LG_SCREEN,
        payload: window.innerWidth >= 1024,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Fetch case templates, doc templates, and task templates from SQLite
    Promise.all([
      invoke<CaseTemplate[]>("list_case_templates"),
      invoke<DocTemplate[]>("list_templates"),
      invoke<TaskTemplate[]>("list_task_templates"),
    ])
      .then(([caseRes, docRes, taskRes]) => {
        dispatch({
          type: CaseCreateActionType.TEMPLATES_LOADED,
          payload: { templates: caseRes, docTemplates: docRes, taskTemplates: taskRes },
        });
      })
      .catch((err) => {
        console.error("Failed to load templates:", err);
        dispatch({ type: CaseCreateActionType.SET_ERROR, payload: "Failed to load templates." });
      });
  }, []);

  // Parse fields for the currently selected template
  const activeTemplate = templates.find((t) => String(t.id) === selectedTemplateId);
  const activeTaskTemplate = taskTemplates.find((t) => String(t.id) === selectedTaskTemplateId);
  const templateFields: string[] = useMemo(
    () => parseTemplateFields(activeTemplate),
    [activeTemplate]
  );

  // Map each field to the documents containing it. Both are memoised because
  // fieldToDocsMap feeds the filteredTemplateFields dependency array below — as
  // a bare object literal it took a new identity every render, which defeated
  // that memo entirely and churned every callback derived from it.
  const associatedDocs = useMemo(
    () => docTemplates.filter((doc) => activeTemplate?.doc_template_ids.includes(doc.id)),
    [docTemplates, activeTemplate]
  );

  const fieldToDocsMap: Record<string, DocTemplate[]> = useMemo(() => {
    const map: Record<string, DocTemplate[]> = {};
    associatedDocs.forEach((doc) => {
      try {
        const fields = JSON.parse(doc.fields_found) as string[];
        fields.forEach((f) => {
          if (!map[f]) {
            map[f] = [];
          }
          map[f].push(doc);
        });
      } catch {}
    });
    return map;
  }, [associatedDocs]);

  const { uniqueRows, getFilteredFields } = useRowFields(templateFields);

  const filteredTemplateFields = useMemo(() => {
    return getFilteredFields(selectedRow, searchQuery, (field) => {
      if (filterDocId !== null) {
        const docs = fieldToDocsMap[field] || [];
        return docs.some((d) => d.id === filterDocId);
      }
      return true;
    });
  }, [getFilteredFields, selectedRow, searchQuery, filterDocId, fieldToDocsMap]);

  const loadFullDocHtml = useCallback(async (docId: number) => {
    dispatch({ type: CaseCreateActionType.PREVIEW_LOAD_START });
    try {
      const doc = docTemplates.find((d) => d.id === docId);
      if (!doc) throw new Error("Document template not found");

      const ext = doc.file_ext ? doc.file_ext.toLowerCase() : doc.file_name.split('.').pop()?.toLowerCase() || "";

      if (ext === "docx") {
        const bytes = await invoke<number[]>("read_file_bytes", { path: doc.marked_path });
        const arrayBuffer = new Uint8Array(bytes).buffer;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        dispatch({
          type: CaseCreateActionType.PREVIEW_LOAD_SUCCESS,
          payload: { docId, html: result.value },
        });
      } else if (ext === "txt" || ext === "json" || ext === "md") {
        const bytes = await invoke<number[]>("read_file_bytes", { path: doc.marked_path });
        const text = new TextDecoder().decode(new Uint8Array(bytes));
        const html = text.split('\n').map((line) => `<p>${line}</p>`).join('');
        dispatch({ type: CaseCreateActionType.PREVIEW_LOAD_SUCCESS, payload: { docId, html } });
      } else {
        throw new Error(`Unsupported preview format: ${ext}`);
      }
    } catch (err) {
      console.error(err);
      dispatch({
        type: CaseCreateActionType.PREVIEW_LOAD_FAILURE,
        payload: `Failed to load document preview: ${err}`,
      });
    }
  }, [docTemplates]);

  const handleToggleDocContext = async (docId: number) => {
    if (expandedDocId === docId) {
      dispatch({ type: CaseCreateActionType.SET_EXPANDED_DOC_ID, payload: null });
      return;
    }

    dispatch({ type: CaseCreateActionType.SET_EXPANDED_DOC_ID, payload: docId });
    if (!docHtmlCache[docId]) {
      await loadFullDocHtml(docId);
    }
  };

  // Keeps the expanded document in step with whichever field just took focus:
  // load it if it covers that field, collapse it if it doesn't. This runs from
  // the handlers that change the focused field rather than from an Effect — it
  // reacts to a user action, not to an external system, and as an Effect it had
  // to omit most of what it read from its dependency array to avoid firing on
  // every render.
  //
  // The predecessor also bailed out when showAllPreviews was set. That guard is
  // deliberately not carried over: every path that focuses a field clears
  // showAllPreviews in the same tick (FOCUS_FIELD_FROM_PREVIEW sets it false,
  // and the fields list calls onShowAllPreviewsChange(false) alongside), so a
  // non-null field always implies showAllPreviews is false by the time this
  // settles. Reading it here would read the pre-dispatch value and wrongly skip.
  const syncExpandedDocToField = useCallback(
    (field: string | null) => {
      if (!field || expandedDocId === null) return;

      const docs = fieldToDocsMap[field] || [];
      const hasDoc = docs.some((d) => d.id === expandedDocId);

      if (hasDoc) {
        if (!docHtmlCache[expandedDocId]) {
          loadFullDocHtml(expandedDocId);
        }
      } else {
        dispatch({ type: CaseCreateActionType.SET_EXPANDED_DOC_ID, payload: null });
      }
    },
    [expandedDocId, fieldToDocsMap, docHtmlCache, loadFullDocHtml]
  );

  // Clicking a placeholder in the bottom preview jumps the top fields panel to
  // that field's input and focuses it, so the user can type a value right away.
  const handleFieldClickFromPreview = useCallback(
    (field: string) => {
      const isHidden = !filteredTemplateFields.includes(field);
      dispatch({
        type: CaseCreateActionType.FOCUS_FIELD_FROM_PREVIEW,
        payload: { field, resetFilters: isHidden },
      });
      syncExpandedDocToField(field);

      // Wait for React to actually commit + paint the re-render (filter reset
      // and/or focused-field highlight) before the target input can be scrolled
      // to/focused — an arbitrary setTimeout delay was unreliable here; a double
      // rAF reliably waits for the next painted frame regardless of what changed.
      const focusInput = () => {
        const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
        if (!input) return;
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        // preventScroll avoids the browser's own focus-triggered auto-scroll
        // fighting with the smooth scrollIntoView call above.
        input.focus({ preventScroll: true });
      };
      requestAnimationFrame(() => requestAnimationFrame(focusInput));
    },
    [filteredTemplateFields, syncExpandedDocToField]
  );

  const handleFocusedFieldChange = useCallback(
    (field: string | null) => {
      dispatch({ type: CaseCreateActionType.SET_FOCUSED_FIELD, payload: field });
      syncExpandedDocToField(field);
    },
    [syncExpandedDocToField]
  );

  const handleOpenTemplateFile = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    try {
      await invoke("open_path", { path: filePath });
    } catch (err) {
      console.error("Failed to open template file:", err);
      alert(`Failed to open template file: ${err}`);
    }
  };

  // Verify if case storage folder is already in use by another case
  useEffect(() => {
    if (!folder.trim()) {
      dispatch({ type: CaseCreateActionType.CLEAR_FOLDER_IN_USE_ERROR });
      return;
    }

    const checkFolder = async () => {
      try {
        const inUse = await invoke<boolean>("verify_folder_in_use", { folderPath: folder.trim() });
        if (inUse) {
          dispatch({ type: CaseCreateActionType.SET_ERROR, payload: FOLDER_IN_USE_ERROR });
        } else {
          dispatch({ type: CaseCreateActionType.CLEAR_FOLDER_IN_USE_ERROR });
        }
      } catch (err) {
        console.error("verify_folder_in_use failed:", err);
      }
    };

    const timer = setTimeout(checkFolder, 300);
    return () => clearTimeout(timer);
  }, [folder]);

  // Browse Directory Dialog
  async function handleBrowse() {
    dispatch({ type: CaseCreateActionType.SET_ERROR, payload: null });
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Case Storage Directory",
      });
      if (selected && typeof selected === "string") {
        dispatch({ type: CaseCreateActionType.SET_FOLDER, payload: selected });
      }
    } catch (err) {
      console.error("Directory browse error:", err);
      dispatch({ type: CaseCreateActionType.SET_ERROR, payload: "Failed to open folder picker." });
    }
  }

  // Handle Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: CaseCreateActionType.SET_ERROR, payload: null });

    if (!subject.trim()) {
      dispatch({ type: CaseCreateActionType.SET_ERROR, payload: "Please enter a case subject." });
      return;
    }
    if (!name.trim()) {
      dispatch({ type: CaseCreateActionType.SET_ERROR, payload: "Please enter a customer name." });
      return;
    }
    if (!folder.trim()) {
      dispatch({
        type: CaseCreateActionType.SET_ERROR,
        payload: "Please select or enter the case folder path.",
      });
      return;
    }

    dispatch({ type: CaseCreateActionType.SET_LOADING, payload: true });
    try {
      // Proactively check if the folder is in use one last time before creating
      const inUse = await invoke<boolean>("verify_folder_in_use", { folderPath: folder.trim() });
      if (inUse) {
        dispatch({ type: CaseCreateActionType.SET_ERROR, payload: FOLDER_IN_USE_ERROR });
        dispatch({ type: CaseCreateActionType.SET_LOADING, payload: false });
        return;
      }

      const isTemplate = selectedTemplateId !== EMPTY_TEMPLATE_ID;
      const templateIdNum = isTemplate ? Number(selectedTemplateId) : null;
      const isTaskTemplate = selectedTaskTemplateId !== EMPTY_TEMPLATE_ID;
      const taskTemplateIdNum = isTaskTemplate ? Number(selectedTaskTemplateId) : null;

      // The user may have unchecked/edited any of the reviewed task drafts,
      // so this explicit list -- not a blind re-materialization of the
      // template -- is what actually gets created (create_new_case gives it
      // priority over taskTemplateId).
      let taskInputs: {
        title: string;
        description: string | null;
        estimate_value: number | null;
        estimate_unit: string | null;
        template_item_id: number;
      }[] | null = null;

      if (isTaskTemplate) {
        taskInputs = [];
        for (const draft of taskDrafts) {
          if (!draft.selected) continue;

          if (!draft.title.trim()) {
            dispatch({
              type: CaseCreateActionType.SET_ERROR,
              payload: "Please enter a title for every selected task, or uncheck it.",
            });
            dispatch({ type: CaseCreateActionType.SET_LOADING, payload: false });
            return;
          }

          let estimateValue: number | null = null;
          let estimateUnit: string | null = null;
          if (draft.estimateShorthand.trim()) {
            const parsed = parseEstimateShorthand(draft.estimateShorthand);
            if (!parsed) {
              dispatch({
                type: CaseCreateActionType.SET_ERROR,
                payload: `Invalid estimate for task "${draft.title}". Use a format like "3d" or "4h".`,
              });
              dispatch({ type: CaseCreateActionType.SET_LOADING, payload: false });
              return;
            }
            estimateValue = parsed.value;
            estimateUnit = parsed.unit;
          }

          taskInputs.push({
            title: draft.title.trim(),
            description: draft.description.trim() || null,
            estimate_value: estimateValue,
            estimate_unit: estimateUnit,
            template_item_id: draft.templateItemId,
          });
        }
      }

      // Call Rust backend command
      const createdCase = await invoke<Case>("create_new_case", {
        subject: subject.trim(),
        name: name.trim(),
        folder: folder.trim(),
        caseTemplateId: templateIdNum,
        taskTemplateId: taskTemplateIdNum,
        tasks: taskInputs,
        fieldValues,
      });

      if (organization.trim()) {
        await invoke("add_tag", {
          scopeType: "case",
          scopeValue: String(createdCase.id),
          name: "organization",
          value: organization.trim(),
          tagType: "user",
        });
      }

      // Redirect back to case list on success
      navigate("/case-management");
    } catch (err) {
      console.error("Case creation failed:", err);
      dispatch({ type: CaseCreateActionType.SET_ERROR, payload: String(err) });
    } finally {
      dispatch({ type: CaseCreateActionType.SET_LOADING, payload: false });
    }
  }

  const hasFields = isCaseTemplateSelected && templateFields.length > 0;
  const showRightPanel = isCaseTemplateSelected || isTaskTemplateSelected || templateHelpOpen;

  return (
    <main className="flex-1 overflow-auto p-4 bg-background">
      <div className={`space-y-4 ${showRightPanel ? "max-w-none w-full" : "max-w-2xl"} transition-all duration-300`}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Case</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill in the details below to initialize a new case and configure its workspace.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
              e.preventDefault();
            }
          }}
          className="space-y-4"
        >
          <div
            id="create-case-split-container"
            className={
              showRightPanel
                ? `flex ${isLgScreen ? "flex-row gap-0 h-[calc(100vh-130px)] lg:h-[calc(100vh-120px)] min-h-[500px]" : "flex-col gap-4"} items-stretch relative ${
                    isDragging ? "select-none cursor-col-resize" : ""
                  }`
                : "space-y-4"
            }
          >
            {/* Left Column: Main Case Details */}
            <div
              className={`rounded-lg border border-border bg-card p-4 space-y-4 ${
                showRightPanel && isLgScreen ? "shrink-0 overflow-y-auto" : ""
              }`}
              style={showRightPanel && isLgScreen ? { flex: `0 0 calc(${leftPercent}% - 6px)` } : undefined}
            >
              <CaseManagementCaseCreateForm
                subject={subject}
                onSubjectChange={(value) =>
                  dispatch({ type: CaseCreateActionType.SET_SUBJECT, payload: value })
                }
                name={name}
                onNameChange={(value) =>
                  dispatch({ type: CaseCreateActionType.SET_NAME, payload: value })
                }
                organization={organization}
                onOrganizationChange={(value) =>
                  dispatch({ type: CaseCreateActionType.SET_ORGANIZATION, payload: value })
                }
                folder={folder}
                onFolderChange={(value) =>
                  dispatch({ type: CaseCreateActionType.SET_FOLDER, payload: value })
                }
                onBrowse={handleBrowse}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onTemplateChange={(value) => {
                  dispatch({ type: CaseCreateActionType.SELECT_TEMPLATE, payload: value });
                  setTemplateHelpOpen(false);
                  if (value !== EMPTY_TEMPLATE_ID) {
                    setActiveRightView("caseTemplate");
                  } else if (selectedTaskTemplateId !== EMPTY_TEMPLATE_ID) {
                    setActiveRightView("taskTemplate");
                  } else {
                    setActiveRightView(null);
                  }
                }}
                taskTemplates={taskTemplates}
                selectedTaskTemplateId={selectedTaskTemplateId}
                onTaskTemplateChange={(value) => {
                  dispatch({ type: CaseCreateActionType.SELECT_TASK_TEMPLATE, payload: value });
                  setTemplateHelpOpen(false);
                  if (value !== EMPTY_TEMPLATE_ID) {
                    setActiveRightView("taskTemplate");
                  } else if (selectedTemplateId !== EMPTY_TEMPLATE_ID) {
                    setActiveRightView("caseTemplate");
                  } else {
                    setActiveRightView(null);
                  }
                }}
                loading={loading}
                templateHelpOpen={templateHelpOpen}
                onToggleTemplateHelp={() => {
                  setTemplateHelpOpen((open) => {
                    const next = !open;
                    if (next) {
                      setActiveRightView("help");
                    } else if (selectedTemplateId !== EMPTY_TEMPLATE_ID) {
                      setActiveRightView("caseTemplate");
                    } else if (selectedTaskTemplateId !== EMPTY_TEMPLATE_ID) {
                      setActiveRightView("taskTemplate");
                    } else {
                      setActiveRightView(null);
                    }
                    return next;
                  });
                }}
              />

              {/* Action Buttons stay directly below Task Template */}
              <CaseManagementCaseCreateFormActions
                loading={loading}
                onCancel={() => navigate("/case-management")}
              />
            </div>

            {/* Resizable Divider (rendered only on large screens when the right panel is shown) */}
            {showRightPanel && isLgScreen && (
              <div
                onMouseDown={startDragging}
                className={`w-3 group cursor-col-resize flex items-center justify-center shrink-0 z-20 select-none ${
                  isDragging ? "bg-primary/10" : "hover:bg-primary/5"
                } transition-colors`}
              >
                <div
                  className={`w-1 h-12 rounded-full ${
                    isDragging ? "bg-primary" : "bg-border/60 group-hover:bg-primary/50"
                  } transition-colors`}
                />
              </div>
            )}

            {/* Right Column: Dynamic single view replacement (Help, Case Template, or Task Review) */}
            {showRightPanel && (
              <div
                className={`flex flex-col min-w-0 ${isLgScreen ? "h-full" : ""}`}
                style={isLgScreen ? { flex: "1 1 0%" } : undefined}
              >
                {activeRightView === "help" || (templateHelpOpen && !isCaseTemplateSelected && !isTaskTemplateSelected) ? (
                  /* Mode 1: Case Template Help */
                  <CaseTemplateHelp onClose={() => {
                    setTemplateHelpOpen(false);
                    if (isCaseTemplateSelected) setActiveRightView("caseTemplate");
                    else if (isTaskTemplateSelected) setActiveRightView("taskTemplate");
                    else setActiveRightView(null);
                  }} />
                ) : activeRightView === "taskTemplate" ? (
                  /* Mode 2: Task Template Review */
                  <CaseManagementCaseCreateTaskReview
                    taskTemplateName={activeTaskTemplate?.name}
                    taskDrafts={taskDrafts}
                    onUpdateDraft={(index, patch) =>
                      dispatch({ type: CaseCreateActionType.UPDATE_TASK_DRAFT, payload: { index, patch } })
                    }
                    loading={loading}
                    isLgScreen={isLgScreen}
                    fillsAvailableSpace={true}
                  />
                ) : isCaseTemplateSelected ? (
                  /* Mode 3: Case Template View */
                  hasFields ? (
                    <CaseManagementCaseCreateTemplateFields
                      isLgScreen={isLgScreen}
                      activeTemplate={activeTemplate}
                      associatedDocs={associatedDocs}
                      showAllPreviews={showAllPreviews}
                      onShowAllPreviewsChange={(value) =>
                        dispatch({ type: CaseCreateActionType.SET_SHOW_ALL_PREVIEWS, payload: value })
                      }
                      searchQuery={searchQuery}
                      onSearchQueryChange={(value) =>
                        dispatch({ type: CaseCreateActionType.SET_SEARCH_QUERY, payload: value })
                      }
                      uniqueRows={uniqueRows}
                      selectedRow={selectedRow}
                      onSelectedRowChange={(value) =>
                        dispatch({ type: CaseCreateActionType.SET_SELECTED_ROW, payload: value })
                      }
                      filterDocId={filterDocId}
                      onFilterDocIdChange={(value) =>
                        dispatch({ type: CaseCreateActionType.SET_FILTER_DOC_ID, payload: value })
                      }
                      filteredTemplateFields={filteredTemplateFields}
                      fieldValues={fieldValues}
                      onFieldValuesChange={(values) =>
                        dispatch({ type: CaseCreateActionType.SET_FIELD_VALUES, payload: values })
                      }
                      focusedField={focusedField}
                      onFocusedFieldChange={handleFocusedFieldChange}
                      loading={loading}
                      isDraggingHeight={isDraggingHeight}
                      onStartDraggingHeight={startDraggingHeight}
                      bottomPercent={bottomPercent}
                      fieldToDocsMap={fieldToDocsMap}
                      expandedDocId={expandedDocId}
                      onExpandedDocIdChange={(value) =>
                        dispatch({ type: CaseCreateActionType.SET_EXPANDED_DOC_ID, payload: value })
                      }
                      onToggleDocContext={handleToggleDocContext}
                      onOpenTemplateFile={handleOpenTemplateFile}
                      docTemplates={docTemplates}
                      loadingContext={loadingContext}
                      previewError={previewError}
                      docHtmlCache={docHtmlCache}
                      templateFields={templateFields}
                      onFieldClickFromPreview={handleFieldClickFromPreview}
                    />
                  ) : (
                    /* Empty Case Template Message Card */
                    <div className="rounded-lg border border-border bg-card p-8 flex flex-col items-center justify-center text-center flex-1 h-full min-h-[350px] space-y-4 animate-in fade-in duration-200">
                      <div className="size-14 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="9" y1="13" x2="15" y2="13" />
                        </svg>
                      </div>
                      <div className="space-y-1.5 max-w-sm">
                        <h3 className="text-base font-semibold text-foreground">
                          {activeTemplate?.name || "Empty Case Template"}
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          This case template does not contain any associated document templates or field variables.
                        </p>
                      </div>
                      <div className="text-[11px] text-muted-foreground/80 bg-muted/40 px-3 py-2 rounded-md border border-border/50 max-w-md">
                        💡 You can proceed with creating the case without documents, or add document templates to this case template in <strong className="text-foreground">Case Templates</strong> settings.
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
