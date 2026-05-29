import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/button";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";

type TemplateRow = {
  id: number;
  file_name: string;
  file_ext: string;
  file_size_kb: number;
  fields_found: string;
  uploaded_at: string;
  original_path: string;
  marked_path: string;
};

type TemplateResult = {
  id: number;
  marked_path: string;
  fields_found: string[];
};

type ProcessingState = {
  status: "processing" | "ok" | "failed";
  message: string;
} | null;

type TemplateProgressEvent = {
  status: string;
  message: string;
};

function fieldCount(fieldsJson: string): number {
  try {
    const arr = JSON.parse(fieldsJson);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function DocsManagementTemplates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ status: "ok" | "failed"; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    loadTemplates();
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function loadTemplates() {
    try {
      const rows = await invoke<TemplateRow[]>("list_templates");
      setTemplates(rows);
    } catch {
      // ignore
    }
  }

  async function handleAddTemplate() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["docx", "pdf", "xlsx", "xls", "txt"] }],
    });
    if (!selected || typeof selected !== "string") return;

    if (!apiKey) {
      setProcessing({
        status: "failed",
        message: "No API key set — go to Settings to add your Claude API key.",
      });
      return;
    }

    setProcessing({ status: "processing", message: "Starting template analysis..." });

    unlistenRef.current = await listen<TemplateProgressEvent>("template-progress", (event) => {
      const { status, message } = event.payload;
      setProcessing({ status: status as "processing" | "ok" | "failed", message });
    });

    try {
      await invoke<TemplateResult>("process_template", { filePath: selected, apiKey });
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProcessing({ status: "ok", message: "Template uploaded and analyzed successfully!" });
      await loadTemplates();
      setTimeout(() => setProcessing(null), 4000);
    } catch (e) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProcessing({ status: "failed", message: String(e) });
    }
  }

  function handleSelectTemplate(t: TemplateRow) {
    setSelectedTemplate(t);
    setGenResult(null);
    try {
      const fields = JSON.parse(t.fields_found) as string[];
      const initialValues: Record<string, string> = {};
      fields.forEach((f) => {
        initialValues[f] = "";
      });
      setFieldValues(initialValues);
    } catch {
      setFieldValues({});
    }
  }

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const ext = selectedTemplate.file_ext;
      const defaultName = `filled_${selectedTemplate.file_name}`;
      const selectedPath = await save({
        defaultPath: defaultName,
        filters: [{ name: "Document", extensions: [ext] }],
      });
      if (!selectedPath) {
        setGenerating(false);
        return;
      }

      await invoke("generate_document_from_template", {
        templateId: selectedTemplate.id,
        fieldValues,
        outputPath: selectedPath,
      });

      setGenResult({
        status: "ok",
        message: `Successfully generated and saved to: ${selectedPath}`,
      });
    } catch (e) {
      setGenResult({ status: "failed", message: String(e) });
    } finally {
      setGenerating(false);
    }
  }

  // Filter templates
  const filteredTemplates = templates.filter((t) =>
    t.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-9.5rem)] rounded-xl border border-border bg-card overflow-hidden shadow-sm animate-fade-in">
      {/* Left Pane: Templates List */}
      <aside className="w-1/3 border-r border-border flex flex-col bg-muted/10 h-full">
        {/* List Header */}
        <div className="p-4 border-b border-border/80 bg-background/50 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Template Vault</h3>
            <Button size="sm" onClick={handleAddTemplate} disabled={processing?.status === "processing"}>
              + Add
            </Button>
          </div>
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {templates.length === 0 ? "No templates added yet." : "No templates match filter."}
            </div>
          ) : (
            filteredTemplates.map((t) => {
              const isSelected = selectedTemplate?.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 flex flex-col gap-1.5 ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/50 bg-background hover:bg-muted/40 hover:border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold truncate text-foreground flex-1">
                      {t.file_name}
                    </span>
                    <span className="shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
                      {t.file_ext}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{formatDate(t.uploaded_at)}</span>
                    <span className="font-medium bg-muted/80 px-1.5 py-0.5 rounded text-foreground/80">
                      {fieldCount(t.fields_found)} variables
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Pane: Workspace */}
      <section className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
        {/* Processing Notification */}
        {processing && (
          <div
            className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold ${
              processing.status === "failed"
                ? "border-red-200 bg-red-50 text-red-800"
                : processing.status === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            {processing.status === "processing" ? (
              <span className="inline-block animate-spin text-blue-500 font-bold">⟳</span>
            ) : processing.status === "ok" ? (
              <span className="text-green-500 font-bold">✓</span>
            ) : (
              <span className="text-red-500 font-bold">✗</span>
            )}
            <span>{processing.message}</span>
          </div>
        )}

        {selectedTemplate ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header Details */}
            <div className="p-6 border-b border-border/60 bg-muted/10 shrink-0 flex items-center justify-between">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground truncate">
                    {selectedTemplate.file_name}
                  </h3>
                  <span className="shrink-0 text-[10px] font-mono bg-muted border rounded-full px-2 py-0.5 text-muted-foreground uppercase">
                    {selectedTemplate.file_ext}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate font-mono">
                  Path: {selectedTemplate.original_path}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
                Clear selection
              </Button>
            </div>

            {/* Variable form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h4 className="text-xs font-bold text-foreground mb-1 uppercase tracking-wider">
                  Fill Document Variables
                </h4>
                <p className="text-xs text-muted-foreground">
                  Provide values for the parsed template placeholders. Blank variables will not be
                  replaced.
                </p>
              </div>

              {Object.keys(fieldValues).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10">
                  No placeholder tags (e.g. `[Variable]`) were identified in this document.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.keys(fieldValues).map((field) => (
                    <div key={field} className="space-y-1.5">
                      <label className="text-[11px] font-mono font-bold text-muted-foreground uppercase tracking-wide">
                        {field.replace(/_/g, " ")}
                      </label>
                      <input
                        type="text"
                        value={fieldValues[field]}
                        onChange={(e) =>
                          setFieldValues({ ...fieldValues, [field]: e.target.value })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder={`Enter value for ${field}...`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Gen results message */}
              {genResult && (
                <div
                  className={`rounded-lg border p-4 text-xs font-medium ${
                    genResult.status === "failed"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-green-200 bg-green-50 text-green-800"
                  }`}
                >
                  <p className="font-bold">
                    {genResult.status === "ok" ? "Success!" : "Generation Failed"}
                  </p>
                  <p className="mt-1 font-mono text-[11px] leading-relaxed break-all">
                    {genResult.message}
                  </p>
                </div>
              )}
            </div>

            {/* Action footer */}
            <div className="p-4 border-t border-border bg-muted/10 shrink-0 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? "Generating Document..." : "Generate & Save Document"}
              </Button>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
                <line x1="9" y1="11" x2="15" y2="11" />
              </svg>
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-sm font-bold text-foreground">No Document Template Selected</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Choose a template from the list on the left to fill placeholders and auto-generate new
                filled copies, or upload a new template to get started.
              </p>
            </div>
            <Button size="sm" onClick={handleAddTemplate} disabled={processing?.status === "processing"}>
              Upload New Template
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
