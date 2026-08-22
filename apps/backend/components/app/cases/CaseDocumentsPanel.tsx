"use client";

import { useEffect, useState } from "react";
import { Button } from "@workspace/ui";
import { useLanguage } from "../../../context/LanguageContext";
import type { DocumentRow } from "../../../lib/documents/crud";
import { ensureReadPermission, getDirectoryHandle, getFileHandle, resolveFileHandle, saveDirectoryHandle } from "../../../lib/documents/localHandles";
import { scanFolderForCase } from "../../../lib/documents/scanning";

type CaseDocumentsPanelProps = {
  caseId: string;
  initialDocuments: DocumentRow[];
};

export default function CaseDocumentsPanel({ caseId, initialDocuments }: CaseDocumentsPanelProps) {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState(initialDocuments);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported("showDirectoryPicker" in window);
    (async () => {
      const handle = await getDirectoryHandle(caseId).catch(() => undefined);
      if (handle && (await ensureReadPermission(handle).catch(() => false))) {
        setConnected(true);
      }
    })();
  }, [caseId]);

  async function handleConnect() {
    setError(null);
    try {
      // showDirectoryPicker is a real browser API, only available behind
      // the feature-detected "supported" check above -- TS's DOM lib
      // types it natively (confirmed, not assumed).
      const handle = await window.showDirectoryPicker({ mode: "read" });
      await saveDirectoryHandle(caseId, handle);
      setConnected(true);
      await scanFolder(handle);
    } catch (err) {
      // AbortError = user cancelled the picker, not a real error.
      if (err instanceof Error && err.name !== "AbortError") {
        setError(t("documents_connect_error"));
      }
    }
  }

  async function scanFolder(handle: FileSystemDirectoryHandle) {
    setScanning(true);
    setError(null);
    try {
      const known = new Set(documents.map((d) => d.relativePath));
      for await (const document of scanFolderForCase(caseId, handle, known)) {
        setDocuments((prev) => [...prev, document]);
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleRescan() {
    const handle = await getDirectoryHandle(caseId);
    if (handle) await scanFolder(handle);
  }

  async function handleOpen(doc: DocumentRow) {
    setError(null);

    // Documents added via the Scan & Index page's "Index Single Document"
    // flow have their own persisted file handle, not a connected
    // directory root -- try that first.
    const singleFileHandle = await getFileHandle(doc.id).catch(() => undefined);
    if (singleFileHandle && (await ensureReadPermission(singleFileHandle).catch(() => false))) {
      try {
        const file = await singleFileHandle.getFile();
        window.open(URL.createObjectURL(file), "_blank");
        return;
      } catch {
        setError(t("documents_open_error"));
        return;
      }
    }

    const handle = await getDirectoryHandle(caseId);
    if (!handle || !(await ensureReadPermission(handle))) {
      setError(t("documents_reconnect_needed"));
      setConnected(false);
      return;
    }
    try {
      const fileHandle = await resolveFileHandle(handle, doc.relativePath);
      const file = await fileHandle.getFile();
      window.open(URL.createObjectURL(file), "_blank");
    } catch {
      setError(t("documents_open_error"));
    }
  }

  async function handleRemove(docId: string) {
    const res = await fetch(`/api/v1/cases/${caseId}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
  }

  if (supported === false) {
    return <p className="text-sm text-muted-foreground">{t("documents_unsupported_browser")}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {connected ? (
          <Button size="sm" onClick={handleRescan} disabled={scanning}>
            {scanning ? t("documents_scanning") : t("documents_rescan_button")}
          </Button>
        ) : (
          <Button size="sm" onClick={handleConnect}>
            {t("documents_connect_button")}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("documents_empty_state")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
              <button onClick={() => handleOpen(doc)} className="text-sm text-foreground hover:underline text-left">
                {doc.fileName}
              </button>
              <button onClick={() => handleRemove(doc.id)} className="text-xs text-muted-foreground hover:text-destructive">
                {t("documents_remove_button")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
