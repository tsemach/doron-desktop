// Client-side only. Shared by CaseDocumentsPanel (a case's Documents tab)
// and ScanIndexClient (the global, caseless Scan & Index page) -- both
// register locally-picked files and index .txt content the same way, so
// the request/response shape lives here once instead of twice. A caseId
// registers the document against that case (/api/v1/cases/[id]/documents,
// CaseDocumentsPanel's flow); omitting it registers a caseless document
// (/api/v1/documents, ScanIndexClient's flow) -- see documents.caseId in
// packages/backend-orm/src/schema.ts for the visibility split this backs.

import type { DocumentRow } from "./crud";
import { saveFileHandle, walkDirectory } from "./localHandles";

async function registerAndIndex(fileName: string, relativePath: string, fileHandle: FileSystemFileHandle, caseId?: string): Promise<DocumentRow | null> {
  const url = caseId ? `/api/v1/cases/${caseId}/documents` : "/api/v1/documents";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, relativePath }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const document = data.document as DocumentRow;

  // Persisted regardless of caseId so "open" always works the same way
  // (localHandles.ts's getFileHandle) -- a case-scoped document can still
  // also be re-resolved via its connected directory root as a fallback
  // (CaseDocumentsPanel.handleOpen already tries this handle first).
  await saveFileHandle(document.id, fileHandle).catch(() => {});

  // Only .txt is indexed for search in this pass -- PDF/Word extraction
  // (pdfjs-dist/mammoth) is a real, larger fast-follow (see
  // docs/backend-saas/phase-5-search-indexing/design.md); the document is
  // still registered and openable either way, just not searchable yet.
  if (fileName.toLowerCase().endsWith(".txt")) {
    const text = await fileHandle.getFile().then((f) => f.text());
    await fetch(`/api/v1/documents/${document.id}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => {}); // indexing failure doesn't block the scan -- the document is already registered and usable
  }

  return document;
}

// Walks a connected directory root and registers every not-yet-known file
// under it, yielding each newly-registered document as it's added.
export async function* scanFolder(
  handle: FileSystemDirectoryHandle,
  knownRelativePaths: Set<string>,
  caseId?: string
): AsyncGenerator<DocumentRow> {
  for await (const { relativePath, fileHandle } of walkDirectory(handle)) {
    if (knownRelativePaths.has(relativePath)) continue;
    const fileName = relativePath.split("/").pop() ?? relativePath;
    const document = await registerAndIndex(fileName, relativePath, fileHandle, caseId);
    if (document) {
      knownRelativePaths.add(relativePath);
      yield document;
    }
  }
}

// Registers a single picked file, not part of any connected directory --
// relativePath is just its own file name.
export async function registerSingleFile(fileHandle: FileSystemFileHandle, caseId?: string): Promise<DocumentRow | null> {
  return registerAndIndex(fileHandle.name, fileHandle.name, fileHandle, caseId);
}

// Walks a directory root once, collecting every file entry up front --
// backs the global Scan & Index page's confirm step, which needs a total
// file count before showing "Files: 0 / <total>" progress.
export async function collectFiles(handle: FileSystemDirectoryHandle): Promise<{ relativePath: string; fileHandle: FileSystemFileHandle }[]> {
  const files: { relativePath: string; fileHandle: FileSystemFileHandle }[] = [];
  for await (const entry of walkDirectory(handle)) files.push(entry);
  return files;
}

export type GlobalScanEvent =
  | { type: "skipped"; relativePath: string; fileName: string }
  | { type: "done"; relativePath: string; fileName: string; searchable: boolean }
  | { type: "failed"; relativePath: string; fileName: string };

// Purpose-built for the global Scan & Index page's progress panel: a
// pre-collected file list (from collectFiles above) and a map of
// already-registered caseless documents (relativePath -> document id,
// from lib/documents/crud.ts's listVisibleGlobalDocuments), so a repeat
// scan of the same folder can skip files it's already indexed unless
// force is set, in which case it re-indexes the existing document's
// content in place instead of creating a duplicate row.
export async function* processGlobalScan(
  files: { relativePath: string; fileHandle: FileSystemFileHandle }[],
  existingByPath: Map<string, string>,
  force: boolean
): AsyncGenerator<GlobalScanEvent> {
  for (const { relativePath, fileHandle } of files) {
    const fileName = relativePath.split("/").pop() ?? relativePath;
    const existingId = existingByPath.get(relativePath);

    if (existingId && !force) {
      yield { type: "skipped", relativePath, fileName };
      continue;
    }

    let documentId = existingId;
    if (!documentId) {
      const res = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, relativePath }),
      });
      if (!res.ok) {
        yield { type: "failed", relativePath, fileName };
        continue;
      }
      const data = await res.json();
      documentId = (data.document as DocumentRow).id;
    }

    await saveFileHandle(documentId, fileHandle).catch(() => {});

    const searchable = fileName.toLowerCase().endsWith(".txt");
    if (searchable) {
      const text = await fileHandle.getFile().then((f) => f.text());
      await fetch(`/api/v1/documents/${documentId}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    }

    yield { type: "done", relativePath, fileName, searchable };
  }
}
