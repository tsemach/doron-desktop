import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { CaseTemplate, DocTemplate } from "./CaseManagementTypes";
import mammoth from "mammoth";
import CaseManagementCaseCreateForm from "./CaseManagementCaseCreateForm";
import CaseManagementCaseCreateFormActions from "./CaseManagementCaseCreateFormActions";
import CaseManagementCaseCreateTemplateFields from "./CaseManagementCaseCreateTemplateFields";
import { useRowFields } from "@/hooks/useRowFields";


export default function CaseManagementCaseCreate() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("empty");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [filterDocId, setFilterDocId] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showAllPreviews, setShowAllPreviews] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);
  const [docHtmlCache, setDocHtmlCache] = useState<Record<number, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [bottomPercent, setBottomPercent] = useState(55);
  const [isDraggingHeight, setIsDraggingHeight] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split-pane resizing states
  const [leftPercent, setLeftPercent] = useState(36);
  const [isDragging, setIsDragging] = useState(false);
  const [isLgScreen, setIsLgScreen] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsLgScreen(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("create-case-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      const clamped = Math.max(25, Math.min(75, percentage));
      setLeftPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Dragging handler for the horizontal split pane
  useEffect(() => {
    if (!isDraggingHeight) return;

    const handleMouseMoveHeight = (e: MouseEvent) => {
      const container = document.getElementById("right-fields-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const percentage = ((rect.height - relativeY) / rect.height) * 100;
      // Clamp between 15% and 65% of total height
      const clamped = Math.max(15, Math.min(65, percentage));
      setBottomPercent(clamped);
    };

    const handleMouseUpHeight = () => {
      setIsDraggingHeight(false);
    };

    window.addEventListener("mousemove", handleMouseMoveHeight);
    window.addEventListener("mouseup", handleMouseUpHeight);

    return () => {
      window.removeEventListener("mousemove", handleMouseMoveHeight);
      window.removeEventListener("mouseup", handleMouseUpHeight);
    };
  }, [isDraggingHeight]);

  useEffect(() => {
    // Fetch case templates and doc templates from SQLite
    Promise.all([
      invoke<CaseTemplate[]>("list_case_templates"),
      invoke<DocTemplate[]>("list_templates"),
    ])
      .then(([caseRes, docRes]) => {
        setTemplates(caseRes);
        setDocTemplates(docRes);
      })
      .catch((err) => {
        console.error("Failed to load templates:", err);
        setError("Failed to load templates.");
      });
  }, []);

  // Parse fields for the currently selected template
  const activeTemplate = templates.find((t) => String(t.id) === selectedTemplateId);
  const templateFields: string[] = useMemo(() => {
    if (!activeTemplate) return [];
    try {
      const parsed = JSON.parse(activeTemplate.fields);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to parse template fields:", e);
      return [];
    }
  }, [activeTemplate]);

  // Reset/sync fields when template changes
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    templateFields.forEach((field) => {
      initialValues[field] = "";
    });
    setFieldValues(initialValues);
    setSearchQuery(""); // Reset search query when template changes
    setFilterDocId(null); // Reset document filter when template changes
    setSelectedRow(null); // Reset row filter when template changes
    setFocusedField(null); // Reset focused field
    setShowAllPreviews(false); // Reset "show all previews" mode
    setExpandedDocId(null); // Reset expanded document details
    setDocHtmlCache({}); // Clear preview HTML cache
    setPreviewError(null); // Clear preview error
  }, [selectedTemplateId]);

  // Map each field to the documents containing it
  const associatedDocs = docTemplates.filter((doc) =>
    activeTemplate?.doc_template_ids.includes(doc.id)
  );

  const fieldToDocsMap: Record<string, DocTemplate[]> = {};
  associatedDocs.forEach((doc) => {
    try {
      const fields = JSON.parse(doc.fields_found) as string[];
      fields.forEach((f) => {
        if (!fieldToDocsMap[f]) {
          fieldToDocsMap[f] = [];
        }
        fieldToDocsMap[f].push(doc);
      });
    } catch {}
  });

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

  // Clicking a placeholder in the bottom preview jumps the top fields panel to
  // that field's input and focuses it, so the user can type a value right away.
  const handleFieldClickFromPreview = useCallback((field: string) => {
    const isHidden = !filteredTemplateFields.includes(field);
    if (isHidden) {
      setSearchQuery("");
      setSelectedRow(null);
      setFilterDocId(null);
    }
    setFocusedField(field);
    setShowAllPreviews(false);

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
  }, [filteredTemplateFields]);

  const loadFullDocHtml = async (docId: number) => {
    setLoadingContext(true);
    setPreviewError(null);
    try {
      const doc = docTemplates.find((d) => d.id === docId);
      if (!doc) throw new Error("Document template not found");

      const ext = doc.file_ext ? doc.file_ext.toLowerCase() : doc.file_name.split('.').pop()?.toLowerCase() || "";

      if (ext === "docx") {
        const bytes = await invoke<number[]>("read_file_bytes", { path: doc.marked_path });
        const arrayBuffer = new Uint8Array(bytes).buffer;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setDocHtmlCache((prev) => ({ ...prev, [docId]: result.value }));
      } else if (ext === "txt" || ext === "json" || ext === "md") {
        const bytes = await invoke<number[]>("read_file_bytes", { path: doc.marked_path });
        const text = new TextDecoder().decode(new Uint8Array(bytes));
        const html = text.split('\n').map((line) => `<p>${line}</p>`).join('');
        setDocHtmlCache((prev) => ({ ...prev, [docId]: html }));
      } else {
        throw new Error(`Unsupported preview format: ${ext}`);
      }
    } catch (err) {
      console.error(err);
      setPreviewError(`Failed to load document preview: ${err}`);
    } finally {
      setLoadingContext(false);
    }
  };

  const handleToggleDocContext = async (docId: number) => {
    if (expandedDocId === docId) {
      setExpandedDocId(null);
      return;
    }

    setExpandedDocId(docId);
    if (!docHtmlCache[docId]) {
      await loadFullDocHtml(docId);
    }
  };

  useEffect(() => {
    if (showAllPreviews || !focusedField || expandedDocId === null) return;

    const docs = fieldToDocsMap[focusedField] || [];
    const hasDoc = docs.some((d) => d.id === expandedDocId);

    if (hasDoc) {
      if (!docHtmlCache[expandedDocId]) {
        loadFullDocHtml(expandedDocId);
      }
    } else {
      setExpandedDocId(null);
    }
  }, [focusedField]);

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
      setError((prev) =>
        prev === "A case with this storage directory path already exists." ? null : prev
      );
      return;
    }

    const checkFolder = async () => {
      try {
        const inUse = await invoke<boolean>("verify_folder_in_use", { folderPath: folder.trim() });
        if (inUse) {
          setError("A case with this storage directory path already exists.");
        } else {
          setError((prev) =>
            prev === "A case with this storage directory path already exists." ? null : prev
          );
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
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Case Storage Directory",
      });
      if (selected && typeof selected === "string") {
        setFolder(selected);
      }
    } catch (err) {
      console.error("Directory browse error:", err);
      setError("Failed to open folder picker.");
    }
  }

  // Handle Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!subject.trim()) {
      setError("Please enter a case subject.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter a customer name.");
      return;
    }
    if (!folder.trim()) {
      setError("Please select or enter the case folder path.");
      return;
    }

    setLoading(true);
    try {
      // Proactively check if the folder is in use one last time before creating
      const inUse = await invoke<boolean>("verify_folder_in_use", { folderPath: folder.trim() });
      if (inUse) {
        setError("A case with this storage directory path already exists.");
        setLoading(false);
        return;
      }

      const isTemplate = selectedTemplateId !== "empty";
      const templateIdNum = isTemplate ? Number(selectedTemplateId) : null;

      // Call Rust backend command
      await invoke("create_new_case", {
        subject: subject.trim(),
        name: name.trim(),
        folder: folder.trim(),
        caseTemplateId: templateIdNum,
        fieldValues,
      });

      // Redirect back to case list on success
      navigate("/case-management");
    } catch (err) {
      console.error("Case creation failed:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const hasFields = selectedTemplateId !== "empty" && templateFields.length > 0;

  return (
    <main className="flex-1 overflow-auto p-4 bg-background">
      <div className={`space-y-4 ${hasFields ? "max-w-none w-full" : "max-w-2xl"} transition-all duration-300`}>
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
              hasFields
                ? `flex ${isLgScreen ? "flex-row gap-0 h-[calc(100vh-220px)] lg:h-[calc(100vh-200px)] min-h-[350px]" : "flex-col gap-4"} items-stretch relative ${
                    isDragging ? "select-none cursor-col-resize" : ""
                  }`
                : "space-y-4"
            }
          >
            {/* Left Column: Main Case Details */}
            <div
              className={`rounded-lg border border-border bg-card p-4 space-y-3 ${
                hasFields && isLgScreen ? "shrink-0 overflow-y-auto" : ""
              }`}
              style={hasFields && isLgScreen ? { flex: `0 0 calc(${leftPercent}% - 6px)` } : undefined}
            >
              <CaseManagementCaseCreateForm
                subject={subject}
                onSubjectChange={setSubject}
                name={name}
                onNameChange={setName}
                folder={folder}
                onFolderChange={setFolder}
                onBrowse={handleBrowse}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onTemplateChange={setSelectedTemplateId}
                loading={loading}
              />
            </div>

            {/* Resizable Divider (rendered only on large screens when fields are shown) */}
            {hasFields && isLgScreen && (
              <div
                onMouseDown={() => setIsDragging(true)}
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

            {/* Right Column: Dynamic Template Fields */}
            {hasFields && (
              <CaseManagementCaseCreateTemplateFields
                isLgScreen={isLgScreen}
                activeTemplate={activeTemplate}
                associatedDocs={associatedDocs}
                showAllPreviews={showAllPreviews}
                onShowAllPreviewsChange={setShowAllPreviews}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                uniqueRows={uniqueRows}
                selectedRow={selectedRow}
                onSelectedRowChange={setSelectedRow}
                filterDocId={filterDocId}
                onFilterDocIdChange={setFilterDocId}
                filteredTemplateFields={filteredTemplateFields}
                fieldValues={fieldValues}
                onFieldValuesChange={setFieldValues}
                focusedField={focusedField}
                onFocusedFieldChange={setFocusedField}
                loading={loading}
                isDraggingHeight={isDraggingHeight}
                onDraggingHeightChange={setIsDraggingHeight}
                bottomPercent={bottomPercent}
                fieldToDocsMap={fieldToDocsMap}
                expandedDocId={expandedDocId}
                onExpandedDocIdChange={setExpandedDocId}
                onToggleDocContext={handleToggleDocContext}
                onOpenTemplateFile={handleOpenTemplateFile}
                docTemplates={docTemplates}
                loadingContext={loadingContext}
                previewError={previewError}
                docHtmlCache={docHtmlCache}
                templateFields={templateFields}
                onFieldClickFromPreview={handleFieldClickFromPreview}
              />
            )}
          </div>

          {/* Action Buttons */}
          <CaseManagementCaseCreateFormActions
            loading={loading}
            onCancel={() => navigate("/case-management")}
          />
        </form>
      </div>
    </main>
  );
}
