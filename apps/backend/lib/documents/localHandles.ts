// Client-side only -- persists a case's connected FileSystemDirectoryHandle
// in IndexedDB, keyed by caseId. The handle itself never leaves the
// browser; the server only ever sees fileName/relativePath metadata (see
// docs/backend-saas/phase-4-local-documents/design.md). FileSystemHandle
// objects are structured-cloneable and IndexedDB-storable natively -- a
// browser platform guarantee, not a library.

const DB_NAME = "ascurix-documents";
const STORE_NAME = "directory-handles";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
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
// a real browser security policy, not a design choice.
export async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const options = { mode: "read" as const };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

// Recursively walks a directory handle, yielding [relativePath, fileHandle]
// pairs. relativePath is "/"-joined from the connected root, matching
// documents.relativePath's meaning exactly.
export async function* walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ""
): AsyncGenerator<{ relativePath: string; fileHandle: FileSystemFileHandle }> {
  for await (const [name, handle] of dirHandle.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      yield { relativePath, fileHandle: handle };
    } else {
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
