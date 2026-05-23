import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
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

function StatusIcon({ status }: { status: "processing" | "ok" | "failed" }) {
  if (status === "processing")
    return (
      <span className="inline-block animate-spin text-blue-500 mr-2">⟳</span>
    );
  if (status === "ok")
    return <span className="text-green-500 mr-2">✓</span>;
  return <span className="text-red-500 mr-2">✗</span>;
}

export default function DocsManagementTemplates() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [processing, setProcessing] = useState<ProcessingState>(null);
  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    loadTemplates();
    return () => { unlistenRef.current?.(); };
  }, []);

  async function loadTemplates() {
    try {
      const rows = await invoke<TemplateRow[]>("list_templates");
      setTemplates(rows);
    } catch {
      // ignore — table might not exist yet on first run
    }
  }

  async function handleAddTemplate() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Documents", extensions: ["docx", "pdf", "xlsx", "xls", "txt"] }],
    });
    if (!selected || typeof selected !== "string") return;

    if (!apiKey) {
      setProcessing({ status: "failed", message: "No API key set — go to Settings to add your Claude API key." });
      return;
    }

    setProcessing({ status: "processing", message: "starting..." });

    unlistenRef.current = await listen<TemplateProgressEvent>("template-progress", (event) => {
      const { status, message } = event.payload;
      setProcessing({ status: status as "processing" | "ok" | "failed", message });
    });

    try {
      await invoke<TemplateResult>("process_template", { filePath: selected, apiKey });
      unlistenRef.current?.();
      unlistenRef.current = null;
      await loadTemplates();
    } catch (e) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProcessing({ status: "failed", message: String(e) });
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <Button onClick={handleAddTemplate} disabled={processing?.status === "processing"}>
        Add Template
      </Button>

      {processing && (
        <div className={`flex items-center rounded-md border px-4 py-2 text-sm ${
          processing.status === "failed"
            ? "border-red-400 bg-red-50 text-red-800"
            : processing.status === "ok"
            ? "border-green-400 bg-green-50 text-green-800"
            : "border-blue-300 bg-blue-50 text-blue-800"
        }`}>
          <StatusIcon status={processing.status} />
          {processing.message}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="rounded-md border bg-muted/40 px-6 py-8 text-center text-sm text-muted-foreground">
          No templates yet. Click <strong>Add Template</strong> to upload your first one.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">File Name</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Fields Found</th>
                <th className="px-4 py-2 text-left font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 font-mono">{t.file_name}</td>
                  <td className="px-4 py-2 uppercase text-muted-foreground">{t.file_ext}</td>
                  <td className="px-4 py-2">{fieldCount(t.fields_found)} fields</td>
                  <td className="px-4 py-2 text-muted-foreground">{formatDate(t.uploaded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
