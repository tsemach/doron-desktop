import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { CaseTemplate, DocTemplate } from "./CaseManagementTypes";
import mammoth from "mammoth";


export default function CaseManagementCaseCreate() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("empty");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [filterDocId, setFilterDocId] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);
  const [docHtmlCache, setDocHtmlCache] = useState<Record<number, string>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [bottomPercent, setBottomPercent] = useState(33);
  const [isDraggingHeight, setIsDraggingHeight] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split-pane resizing states
  const [leftPercent, setLeftPercent] = useState(45);
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
      // Clamp between 15% and 60% of total height
      const clamped = Math.max(15, Math.min(60, percentage));
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
  const templateFields: string[] = activeTemplate ? JSON.parse(activeTemplate.fields) : [];

  // Reset/sync fields when template changes
  useEffect(() => {
    const initialValues: Record<string, string> = {};
    templateFields.forEach((field) => {
      initialValues[field] = "";
    });
    setFieldValues(initialValues);
    setSearchQuery(""); // Reset search query when template changes
    setFilterDocId(null); // Reset document filter when template changes
    setFocusedField(null); // Reset focused field
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

  const filteredTemplateFields = templateFields.filter((field) => {
    const matchesSearch = field.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterDocId !== null) {
      const docs = fieldToDocsMap[field] || [];
      return docs.some((d) => d.id === filterDocId);
    }
    return true;
  });

  const loadFullDocHtml = async (docId: number) => {
    setLoadingContext(true);
    setPreviewError(null);
    try {
      const doc = docTemplates.find((d) => d.id === docId);
      if (!doc) throw new Error("Document template not found");

      const ext = doc.file_ext ? doc.file_ext.toLowerCase() : doc.file_name.split('.').pop()?.toLowerCase() || "";

      if (ext === "docx") {
        const bytes = await invoke<number[]>("read_file_bytes", { path: doc.original_path });
        const arrayBuffer = new Uint8Array(bytes).buffer;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setDocHtmlCache((prev) => ({ ...prev, [docId]: result.value }));
      } else if (ext === "txt" || ext === "json" || ext === "md") {
        const bytes = await invoke<number[]>("read_file_bytes", { path: doc.original_path });
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
    if (!focusedField || expandedDocId === null) return;

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

  // Scroll focused field into view in the document preview page
  useEffect(() => {
    if (expandedDocId === null || !focusedField || !docHtmlCache[expandedDocId]) return;

    const timer = setTimeout(() => {
      const anchor = document.getElementById("focused-field-preview-anchor");
      if (anchor) {
        anchor.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [focusedField, expandedDocId, docHtmlCache]);

  const isRtlText = (text: string | null | undefined): boolean => {
    if (!text) return false;
    const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF]/;
    return rtlRegex.test(text);
  };

  const renderHtmlWithValues = (html: string) => {
    if (!html) return "";
    let processedHtml = html;

    templateFields.forEach((field) => {
      const placeholder = `[[${field}]]`;
      const isFocused = field === focusedField;
      const userValue = fieldValues[field];

      let replacement = "";
      if (userValue && userValue.trim() !== "") {
        const focusAttr = isFocused ? 'id="focused-field-preview-anchor"' : '';
        const focusClass = isFocused ? 'ring-2 ring-primary ring-offset-1 ring-offset-white' : '';
        replacement = `<span ${focusAttr} class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 inline-block font-mono text-xs ${focusClass}" title="Filled: ${field}">${userValue}</span>`;
      } else {
        const focusAttr = isFocused ? 'id="focused-field-preview-anchor"' : '';
        const highlightClass = isFocused
          ? "bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-500/40 inline-block animate-pulse text-xs ring-2 ring-amber-500 ring-offset-1 ring-offset-white"
          : "bg-amber-50 text-amber-700 font-mono px-1 rounded border border-amber-500/20 border-dashed inline-block text-[11px]";
        replacement = `<span ${focusAttr} class="${highlightClass}" title="Unfilled: ${field}">[[${field}]]</span>`;
      }

      processedHtml = processedHtml.split(placeholder).join(replacement);
    });

    return processedHtml;
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

  const leftFields = (
    <>
      {/* Subject */}
      <div className="space-y-1">
        <label htmlFor="subject" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Subject
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Eviction Notice, Acquisition Agreement"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          disabled={loading}
        />
      </div>

      {/* Customer Name */}
      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Customer Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. John Doe, Acme Corp"
          className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          disabled={loading}
        />
      </div>

      {/* Folder Path */}
      <div className="space-y-1">
        <label htmlFor="folder" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Directory Path
        </label>
        <p className="text-xs text-muted-foreground">
          All templates and case files will reside in this directory.
        </p>
        <div className="flex gap-2">
          <input
            id="folder"
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="Select or type folder path..."
            className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono"
            disabled={loading}
          />
          <Button type="button" variant="secondary" onClick={handleBrowse} disabled={loading} className="px-5 py-3 h-auto">
            Browse...
          </Button>
        </div>
      </div>

      {/* Template Selector */}
      <div className="space-y-1">
        <label htmlFor="template" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Case Template
        </label>
        <div className="relative">
          <select
            id="template"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="w-full rounded-md border-0 bg-background pl-4 pr-10 rtl:pr-4 rtl:pl-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring h-[46px] shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
            disabled={loading}
          >
            <option value="empty">Create Empty Case (No Documents)</option>
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-3.5 rtl:left-3.5 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </>
  );

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
              {leftFields}
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
              <div
                id="right-fields-container"
                className={`rounded-lg border border-border bg-card p-4 animate-in fade-in slide-in-from-right-4 duration-300 min-w-0 flex flex-col gap-3 ${
                  isLgScreen ? "h-full" : ""
                }`}
                style={isLgScreen ? { flex: "1 1 0%" } : undefined}
              >
                {/* Top portion: fields list */}
                <div 
                  className="flex flex-col min-h-0" 
                  style={focusedField && isLgScreen ? { height: `${100 - bottomPercent}%` } : { flex: "1 1 0%" }}
                >
                  <div className="shrink-0">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Template Fields ({activeTemplate?.name})
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enter real values for the template variables. Unfilled fields will remain as placeholders.
                    </p>
                  </div>

                  {/* Search and Document Filter Bar */}
                  <div className="flex flex-col sm:flex-row gap-2 mt-2 mb-2 shrink-0">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Search fields..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-mono"
                      />
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground font-semibold text-xs cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {associatedDocs.length > 0 && (
                      <div className="relative w-full sm:w-[220px]">
                        <select
                          value={filterDocId ?? "all"}
                          onChange={(e) => setFilterDocId(e.target.value === "all" ? null : Number(e.target.value))}
                          className="rounded-md border-0 bg-background pl-3 pr-8 rtl:pr-3 rtl:pl-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring h-[34px] w-full shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
                        >
                          <option value="all">All Documents ({associatedDocs.length})</option>
                          {associatedDocs.map((doc) => (
                            <option key={doc.id} value={doc.id}>
                              {doc.title || doc.file_name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-2.5 rtl:left-2.5 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>

                  {filteredTemplateFields.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10 flex-1 flex items-center justify-center">
                      No template fields match your search/filter query.
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2 pb-2">
                        {filteredTemplateFields.map((field) => (
                          <div key={field} className="space-y-0.5">
                            <label
                              htmlFor={`field-${field}`}
                              className="text-xs font-mono font-medium text-muted-foreground truncate block"
                              title={field}
                            >
                              {field}
                            </label>
                            <input
                              id={`field-${field}`}
                              type="text"
                              placeholder={`Value...`}
                              value={fieldValues[field] || ""}
                              onChange={(e) => setFieldValues({ ...fieldValues, [field]: e.target.value })}
                              onFocus={() => setFocusedField(field)}
                              className="w-full rounded-md border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono"
                              disabled={loading}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Resizable Separation Line */}
                {focusedField && isLgScreen && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingHeight(true);
                    }}
                    className={`h-[1px] cursor-row-resize z-20 select-none shrink-0 ${
                      isDraggingHeight ? "bg-primary" : "bg-border hover:bg-primary/50"
                    } transition-colors relative flex items-center`}
                  >
                    <div className="absolute inset-x-0 h-4 top-1/2 -translate-y-1/2 cursor-row-resize" />
                  </div>
                )}

                {/* Bottom portion: Document Context drawer */}
                {focusedField && (
                  <div
                    className="flex flex-col min-h-0 border border-border/80 bg-background/50 rounded-lg p-4 space-y-3 shrink-0"
                    style={isLgScreen ? { height: `${bottomPercent}%` } : { maxHeight: "280px" }}
                  >
                    <div className="flex justify-between items-center shrink-0 pb-1 border-b border-border/60">
                      <div>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                          Context for Field: <span className="font-mono text-primary">{focusedField}</span>
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Select a document card below to view its context snippet.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusedField(null);
                          setExpandedDocId(null);
                        }}
                        className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors text-xs font-semibold"
                        title="Close context drawer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Context Body: Grid of associated document cards */}
                    <div className="flex-1 overflow-y-auto pr-1">
                      {(() => {
                        const docs = fieldToDocsMap[focusedField] || [];
                        if (docs.length === 0) {
                          return (
                            <div className="flex items-center justify-center h-full text-center text-xs text-muted-foreground italic py-4">
                              This field is manually added and does not belong to any document templates.
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            {/* Horizontal grid of document cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {docs.map((doc) => {
                                const isExpanded = expandedDocId === doc.id;
                                return (
                                  <div
                                    key={doc.id}
                                    className={`rounded-lg p-3 transition-colors duration-150 flex flex-col justify-between cursor-pointer select-none ${
                                      isExpanded
                                        ? "bg-primary/10"
                                        : "bg-muted/30 hover:bg-muted/50"
                                    }`}
                                    onClick={() => handleToggleDocContext(doc.id)}
                                  >
                                    <div className="flex items-start justify-between gap-2 min-w-0">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="text-primary shrink-0"
                                        >
                                          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                        </svg>
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-foreground truncate" title={doc.title || doc.file_name}>
                                            {doc.title || doc.file_name}
                                          </p>
                                          <p className="text-[9px] text-muted-foreground font-mono truncate">
                                            {doc.file_name}
                                          </p>
                                        </div>
                                      </div>
                                      
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleDocContext(doc.id);
                                        }}
                                        className={`p-1 rounded hover:bg-muted transition-all shrink-0 ${
                                          isExpanded ? "text-primary rotate-180" : "text-muted-foreground"
                                        }`}
                                        title={isExpanded ? "Collapse context snippet" : "Expand context snippet"}
                                      >
                                        <svg
                                          xmlns="http://www.w3.org/2000/svg"
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="transition-transform duration-200"
                                        >
                                          <path d="m6 9 6 6 6-6" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Full-width context snippet container below the grid if any card is expanded */}
                            {expandedDocId && (
                              <div className="border border-border/80 rounded-lg p-3 bg-muted/20 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="flex justify-between items-center pb-1 border-b border-border/40">
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                    Document Live Preview
                                  </span>
                                  <span className="text-[9px] text-muted-foreground font-mono">
                                    {docTemplates.find(d => d.id === expandedDocId)?.file_name}
                                  </span>
                                </div>
                                {loadingContext ? (
                                  <div className="py-6 flex items-center justify-center text-xs text-muted-foreground">
                                    <svg
                                      className="animate-spin -ml-1 mr-3 h-4 w-4 text-primary"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      />
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      />
                                    </svg>
                                    Loading template preview...
                                  </div>
                                ) : previewError ? (
                                  <div className="py-4 text-center text-xs text-destructive bg-destructive/10 rounded border border-destructive/20">
                                    {previewError}
                                  </div>
                                ) : docHtmlCache[expandedDocId] ? (
                                  <div className="bg-background/80 dark:bg-background/20 p-3 rounded-lg border border-border/40 overflow-y-auto max-h-[300px] min-h-[220px] relative select-text">
                                    <div 
                                      className="bg-white text-black p-6 sm:p-10 shadow-[0_4px_16px_rgba(0,0,0,0.06),_0_2px_4px_rgba(0,0,0,0.03)] border border-gray-100 mx-auto max-w-[800px] prose prose-sm max-w-none prose-headings:text-black prose-p:text-black text-xs sm:text-sm leading-relaxed font-serif"
                                      dir={isRtlText(docHtmlCache[expandedDocId]) ? "rtl" : "ltr"}
                                      dangerouslySetInnerHTML={{ __html: renderHtmlWithValues(docHtmlCache[expandedDocId]) }}
                                    />
                                  </div>
                                ) : (
                                  <div className="py-4 text-center text-xs text-muted-foreground">
                                    No preview available
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/case-management")}
              disabled={loading}
              className="px-6 py-2.5 h-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="px-6 py-2.5 h-auto">
              {loading ? "Creating..." : "Create Case"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
