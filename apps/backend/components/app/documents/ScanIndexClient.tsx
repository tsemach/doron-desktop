"use client";

import { useEffect, useState } from "react";
import { Folder, FileText } from "lucide-react";
import { useLanguage } from "../../../context/LanguageContext";
import {
  ensureReadPermission,
  saveDirectoryHandle,
  saveFileHandle,
} from "../../../lib/documents/localHandles";
import { registerSingleFile, scanFolderForCase } from "../../../lib/documents/scanning";

type ScanIndexClientProps = {
  cases: { id: string; name: string }[];
};

// Mirrors desktop's DocsManagementScan.tsx: a case must be chosen first
// (documents are case-scoped in this backend -- see documents.caseId in
// packages/backend-orm/src/schema.ts -- unlike desktop's global,
// case-less local index), then either action registers files against it
// via the same File System Access API flow as CaseDocumentsPanel.
export default function ScanIndexClient({ cases }: ScanIndexClientProps) {
  const { t } = useLanguage();
  const [caseId, setCaseId] = useState(cases[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Matches CaseDocumentsPanel's SSR-safe pattern: computed after mount,
  // not inline during render, so server and first-client-render markup
  // agree (avoids a hydration mismatch on the window-only check below).
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported("showDirectoryPicker" in window);
  }, []);

  async function handleIndexFolder() {
    if (!caseId) {
      setError("Select a case first.");
      return;
    }
    setError(null);
    setStatus(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await saveDirectoryHandle(caseId, handle);
      setBusy(true);
      let count = 0;
      for await (const _document of scanFolderForCase(caseId, handle, new Set())) {
        count += 1;
      }
      setStatus(`Indexed ${count} file${count === 1 ? "" : "s"}.`);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(t("documents_connect_error"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleIndexSingleFile() {
    if (!caseId) {
      setError("Select a case first.");
      return;
    }
    setError(null);
    setStatus(null);
    try {
      const [fileHandle] = await window.showOpenFilePicker({ multiple: false });
      if (!(await ensureReadPermission(fileHandle))) return;
      setBusy(true);
      const document = await registerSingleFile(caseId, fileHandle);
      if (!document) {
        setError(t("documents_connect_error"));
        return;
      }
      await saveFileHandle(document.id, fileHandle);
      setStatus(`Indexed "${document.fileName}".`);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(t("documents_connect_error"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (supported === false) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">{t("documents_unsupported_browser")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 px-6 py-10">
      <div className="max-w-3xl mx-auto text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">Index Documents for AI Search</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect local files or folders. Ascurix will parse text, extract metadata keywords, and generate vector embeddings for
          intelligent semantic search.
        </p>
      </div>

      <div className="max-w-3xl mx-auto mb-6 flex items-center justify-center gap-2">
        <label htmlFor="scan-case-select" className="text-sm text-muted-foreground">
          Case
        </label>
        <select
          id="scan-case-select"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          {cases.length === 0 && <option value="">No cases yet</option>}
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Folder className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Index Entire Folder</h3>
          <p className="text-xs text-muted-foreground flex-1">
            Recursively scans a directory for PDF, DOCX, TXT, and Excel sheets. Perfect for importing legal archives.
          </p>
          <button
            onClick={handleIndexFolder}
            disabled={busy || !caseId}
            className="text-sm font-medium text-primary hover:underline text-left disabled:opacity-50 disabled:no-underline"
          >
            Choose Directory →
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Index Single Document</h3>
          <p className="text-xs text-muted-foreground flex-1">
            Select a single document to index. Ideal for quick updates or testing formatting.
          </p>
          <button
            onClick={handleIndexSingleFile}
            disabled={busy || !caseId}
            className="text-sm font-medium text-primary hover:underline text-left disabled:opacity-50 disabled:no-underline"
          >
            Choose File →
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto mt-6 text-center">
        {busy && <p className="text-sm text-muted-foreground">{t("documents_scanning")}</p>}
        {status && !busy && <p className="text-sm text-foreground">{status}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
