// Client-side only -- persists a case's connected FileSystemDirectoryHandle
// in IndexedDB, keyed by caseId. The handle itself never leaves the
// browser; the server only ever sees fileName/relativePath metadata (see
// docs/backend-saas/phase-4-local-documents/design.md). FileSystemHandle
// objects are structured-cloneable and IndexedDB-storable natively -- a
// browser platform guarantee, not a library.

const DB_NAME = "ascurix-documents";
const STORE_NAME = "directory-handles";
// Keyed by documentId -- persists a single file's handle for documents
// registered via the Scan & Index page's "Index Single Document" flow,
// which has no connected directory root to re-resolve the file from.
const FILE_STORE_NAME = "file-handles";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
      if (!request.result.objectStoreNames.contains(FILE_STORE_NAME)) {
        request.result.createObjectStore(FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(caseId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, caseId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDirectoryHandle(caseId: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(caseId);
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function removeDirectoryHandle(caseId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(caseId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Re-confirms (or requests) read permission on an already-persisted
// handle. Per the design doc: the browser may still require a user
// gesture to re-confirm permission -- not silently permanent forever,
// a real browser security policy, not a design choice. Takes the base
// FileSystemHandle type -- the permission methods are shared by
// directory and file handles alike.
export async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  const options = { mode: "read" as const };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

export async function saveFileHandle(documentId: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_STORE_NAME).put(handle, documentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFileHandle(documentId: string): Promise<FileSystemFileHandle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readonly");
    const request = tx.objectStore(FILE_STORE_NAME).get(documentId);
    request.onsuccess = () => resolve(request.result as FileSystemFileHandle | undefined);
    request.onerror = () => reject(request.error);
  });
}

// Directories a recursive scan has no business descending into -- build
// output/dependency trees, VCS internals, caches. Pruned by name, not
// walked at all (not just filtered after the fact), so a folder that
// happens to contain a huge node_modules doesn't get walked in full just
// to discard its contents.
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", ".git", ".next", ".cache", "dist", "build", ".vscode", ".idea", "__pycache__", ".venv"]);

// Matches the "Index Entire Folder" card's own stated scope ("scans a
// directory for PDF, DOCX, TXT, and Excel sheets") -- without this, an
// unfiltered walk pulls in every source/config file a folder happens to
// contain (observed: a folder with a stray node_modules produced
// thousands of .js/.json/.md registrations with no relation to
// documents at all).
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt", "xls", "xlsx", "csv"]);

function hasAllowedExtension(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext !== undefined && ALLOWED_EXTENSIONS.has(ext);
}

// Recursively walks a directory handle, yielding [relativePath, fileHandle]
// pairs for files matching ALLOWED_EXTENSIONS, skipping hidden entries and
// SKIPPED_DIRECTORY_NAMES entirely. relativePath is "/"-joined from the
// connected root, matching documents.relativePath's meaning exactly.
export async function* walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ""
): AsyncGenerator<{ relativePath: string; fileHandle: FileSystemFileHandle }> {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith(".")) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      if (hasAllowedExtension(name)) {
        yield { relativePath, fileHandle: handle };
      }
    } else if (!SKIPPED_DIRECTORY_NAMES.has(name)) {
      yield* walkDirectory(handle, relativePath);
    }
  }
}

// Re-derives a specific file from an already-connected root handle by
// walking its relativePath segments -- how "open" works, entirely
// client-side, no server round-trip for content (Core Decision 2).
export async function resolveFileHandle(dirHandle: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemFileHandle> {
  const segments = relativePath.split("/");
  let current: FileSystemDirectoryHandle = dirHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    current = await current.getDirectoryHandle(segments[i]);
  }
  return current.getFileHandle(segments[segments.length - 1]);
}
