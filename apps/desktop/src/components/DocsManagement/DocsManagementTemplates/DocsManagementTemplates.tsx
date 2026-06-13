import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "../../ui/button";
import { API_KEY_STORAGE_KEY } from "../../Settings/Settings";
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
import DocsManagementTemplatesMain from "./DocsManagementTemplatesMain";
import TemplateTitlePromptModal from "../TemplateTitlePromptModal";
import TemplateDeleteWarningModal from "../TemplateDeleteWarningModal";

export default function DocsManagementTemplates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateRow | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ status: "ok" | "failed"; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingImport, setPendingImport] = useState<{ filePath: string; fileName: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Sidebar resizing states
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const newWidth = Math.max(200, Math.min(600, e.clientX - containerLeft));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

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

    const path = selected;
    const fileName = path.split(/[/\\]/).pop() || "document";
    setPendingImport({ filePath: selected, fileName });
  }

  async function handleConfirmImport(filePath: string, title: string) {
    setProcessing({ status: "processing", message: "Adding document template..." });

    unlistenRef.current = await listen<TemplateProgressEvent>("template-progress", (event) => {
      const { status, message } = event.payload;
      setProcessing({ status: status as "processing" | "ok" | "failed", message });
    });

    try {
      await invoke<TemplateResult>("process_template", {
        filePath,
        apiKey: apiKey || null,
        title: title || null
      });
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProcessing({ status: "ok", message: "Template uploaded and opened in editor!" });
      await loadTemplates();
      setTimeout(() => setProcessing(null), 4000);
    } catch (e) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProcessing({ status: "failed", message: String(e) });
    }
  }

  async function handleSelectTemplate(t: TemplateRow) {
    setSelectedTemplate(t);
    setGenResult(null);
    try {
      // Dynamically scan the template file to get latest placeholders
      const fields = await invoke<string[]>("sync_template_fields", { templateId: t.id });
      const initialValues: Record<string, string> = {};
      fields.forEach((f) => {
        initialValues[f] = "";
      });
      setFieldValues(initialValues);
      
      // Update both templates and selectedTemplate with the newly synced fields
      const fieldsJson = JSON.stringify(fields);
      setTemplates((prev) =>
        prev.map((item) => (item.id === t.id ? { ...item, fields_found: fieldsJson } : item))
      );
      setSelectedTemplate((prev) =>
        prev && prev.id === t.id ? { ...prev, fields_found: fieldsJson } : prev
      );
    } catch (err) {
      console.error("Failed to sync fields on selection, falling back to database fields:", err);
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
  }

  async function handleSyncFields() {
    if (!selectedTemplate) return;
    setProcessing({ status: "processing", message: "Scanning template for variables..." });
    try {
      const fields = await invoke<string[]>("sync_template_fields", { templateId: selectedTemplate.id });
      const initialValues: Record<string, string> = {};
      fields.forEach((f) => {
        initialValues[f] = "";
      });
      setFieldValues(initialValues);
      setProcessing({ status: "ok", message: "Variables synchronized!" });
      await loadTemplates();
      // Keep selectedTemplate in sync
      setSelectedTemplate((prev) =>
        prev ? { ...prev, fields_found: JSON.stringify(fields) } : null
      );
      setTimeout(() => setProcessing(null), 3000);
    } catch (e) {
      setProcessing({ status: "failed", message: `Sync failed: ${String(e)}` });
      setTimeout(() => setProcessing(null), 4000);
    }
  }

  async function handleSyncAllFields() {
    setIsSyncingAll(true);
    setProcessing({ status: "processing", message: "Scanning all templates for variables..." });
    try {
      await invoke("sync_all_templates_fields");
      setProcessing({ status: "ok", message: "All template variables synchronized!" });
      await loadTemplates();
      setTimeout(() => setProcessing(null), 3000);
    } catch (e) {
      setProcessing({ status: "failed", message: `Sync failed: ${String(e)}` });
      setTimeout(() => setProcessing(null), 4000);
    } finally {
      setIsSyncingAll(false);
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

  async function handleConfirmDelete() {
    if (!selectedTemplate) return;
    setProcessing({ status: "processing", message: "Deleting template..." });
    try {
      await invoke("delete_template", { id: selectedTemplate.id });
      setProcessing({ status: "ok", message: "Template deleted successfully!" });
      setSelectedTemplate(null);
      setShowDeleteConfirm(false);
      await loadTemplates();
      setTimeout(() => setProcessing(null), 3000);
    } catch (e) {
      setProcessing({ status: "failed", message: `Delete failed: ${String(e)}` });
      setShowDeleteConfirm(false);
      setTimeout(() => setProcessing(null), 4000);
    }
  }

  // Filter templates
  const filteredTemplates = templates.filter((t) =>
    t.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-9.5rem)] rounded-xl border border-border bg-card overflow-hidden shadow-sm animate-fade-in">
      {/* Left Pane: Templates List */}
      <aside style={{ width: sidebarWidth }} className="flex flex-col bg-muted/10 h-full shrink-0 overflow-y-auto">
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

      {/* Draggable Resizable Divider */}
      <div
        onMouseDown={startResizing}
        className={`w-[1px] bg-border shrink-0 h-full relative cursor-col-resize select-none group transition-colors duration-150 ${isResizing ? "bg-primary" : "hover:bg-primary"
          }`}
      >
        <div className="absolute top-0 bottom-0 -left-1.5 -right-1.5 cursor-col-resize z-10" />
      </div>

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
            onSyncFields={handleSyncFields}
            onDelete={() => setShowDeleteConfirm(true)}
          />
        ) : (
          /* Main state */
          <DocsManagementTemplatesMain
            onAddTemplate={handleAddTemplate}
            isProcessing={processing?.status === "processing"}
            templates={templates}
            onSyncAllFields={handleSyncAllFields}
            isSyncingAll={isSyncingAll}
          />
        )}
      </section>

      {pendingImport && (
        <TemplateTitlePromptModal
          fileName={pendingImport.fileName}
          onConfirm={(title) => {
            handleConfirmImport(pendingImport.filePath, title);
            setPendingImport(null);
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {showDeleteConfirm && selectedTemplate && (
        <TemplateDeleteWarningModal
          fileName={selectedTemplate.file_name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

