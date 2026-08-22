// Client-side only. Shared by CaseDocumentsPanel (a case's Documents tab)
// and ScanIndexClient (the global Scan & Index page) -- both register
// locally-picked files against the same case-scoped documents API and
// index .txt content the same way, so the request/response shape lives
// here once instead of twice.

import type { DocumentRow } from "./crud";
import { walkDirectory } from "./localHandles";

async function registerAndIndex(caseId: string, fileName: string, relativePath: string, fileHandle: FileSystemFileHandle): Promise<DocumentRow | null> {
  const res = await fetch(`/api/v1/cases/${caseId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, relativePath }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const document = data.document as DocumentRow;

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
export async function* scanFolderForCase(
  caseId: string,
  handle: FileSystemDirectoryHandle,
  knownRelativePaths: Set<string>
): AsyncGenerator<DocumentRow> {
  for await (const { relativePath, fileHandle } of walkDirectory(handle)) {
    if (knownRelativePaths.has(relativePath)) continue;
    const fileName = relativePath.split("/").pop() ?? relativePath;
    const document = await registerAndIndex(caseId, fileName, relativePath, fileHandle);
    if (document) {
      knownRelativePaths.add(relativePath);
      yield document;
    }
  }
}

// Registers a single picked file, not part of any connected directory --
// relativePath is just its own file name, matching how a rootless file is
// re-resolved (localHandles.ts's saveFileHandle/getFileHandle, keyed by
// the resulting document's id, not by a directory root).
export async function registerSingleFile(caseId: string, fileHandle: FileSystemFileHandle): Promise<DocumentRow | null> {
  return registerAndIndex(caseId, fileHandle.name, fileHandle.name, fileHandle);
}
