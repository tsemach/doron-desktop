import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/button";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";
import {
  TemplateRow,
  TemplateResult,
  ProcessingState,
  TemplateProgressEvent,
} from "./DocsManagementTemplates.types";
import DocsManagementTemplatesSearchBar from "./DocsManagementTemplatesSearchBar";
import DocsManagementTemplatesListItem from "./DocsManagementTemplatesListItem";
import DocsManagementTemplatesProcessingStatus from "./DocsManagementTemplatesProcessingStatus";
import DocsManagementTemplatesForm from "./DocsManagementTemplatesForm";
import DocsManagementTemplatesEmptyState from "./DocsManagementTemplatesEmptyState";

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
          <DocsManagementTemplatesSearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {templates.length === 0 ? "No templates added yet." : "No templates match filter."}
            </div>
          ) : (
            filteredTemplates.map((t) => (
              <DocsManagementTemplatesListItem
                key={t.id}
                template={t}
                isSelected={selectedTemplate?.id === t.id}
                onClick={() => handleSelectTemplate(t)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Right Pane: Workspace */}
      <section className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
        {/* Processing Notification */}
        <DocsManagementTemplatesProcessingStatus processing={processing} />

        {selectedTemplate ? (
          <DocsManagementTemplatesForm
            selectedTemplate={selectedTemplate}
            fieldValues={fieldValues}
            setFieldValues={setFieldValues}
            generating={generating}
            genResult={genResult}
            onGenerate={handleGenerate}
            onClearSelection={() => setSelectedTemplate(null)}
          />
        ) : (
          /* Empty state */
          <DocsManagementTemplatesEmptyState
            onAddTemplate={handleAddTemplate}
            isProcessing={processing?.status === "processing"}
          />
        )}
      </section>
    </div>
  );
}

