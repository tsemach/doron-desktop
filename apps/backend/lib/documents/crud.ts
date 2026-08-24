import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../database";
import { documents } from "../../database/schema";
import { getVisibleCaseById } from "../cases/crud";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

export type DocumentRow = typeof documents.$inferSelect;

// Case-scoped documents inherit visibility transitively through their
// case, same pattern as tasks/meetings (Phase 1's design). Documents
// registered globally (no case, matching desktop's case-less document
// model) have no case to inherit through, so they fall back to a direct
// getVisibleMemberUserIds check on addedByUserId instead -- the same
// team-rollup visibility set every other actor-owned row in this schema
// uses. relativePath is a path relative to the connected local folder
// root (or just the file's own name for a caseless single-file pick) --
// never an absolute path (the File System Access API doesn't expose one,
// by spec) and never a way for this server to read the file's actual
// content; see docs/backend-saas/phase-4-local-documents/design.md. This
// table only ever receives fileName/relativePath metadata, POSTed by the
// browser after it walks a locally-granted handle.

export async function listDocumentsForCase(actor: Actor, caseId: string): Promise<DocumentRow[]> {
  const visibleCase = await getVisibleCaseById(actor, caseId);
  if (!visibleCase) return [];

  return db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(asc(documents.fileName));
}

export interface RegisterDocumentFields {
  fileName: string;
  relativePath: string;
}

export type RegisterDocumentResult = { document: DocumentRow } | { error: string; status: number };

export async function registerDocument(actor: Actor, caseId: string, fields: RegisterDocumentFields): Promise<RegisterDocumentResult> {
  const fileName = fields.fileName.trim();
  const relativePath = fields.relativePath.trim();
  if (!fileName || !relativePath) {
    return { error: "fileName and relativePath are required", status: 400 };
  }

  const visibleCase = await getVisibleCaseById(actor, caseId);
  if (!visibleCase) {
    return { error: "Not found", status: 404 };
  }

  const [row] = await db
    .insert(documents)
    .values({ caseId, fileName, relativePath, addedByUserId: actor.id })
    .returning();

  return { document: row };
}

// Backs the "already processed" dedup/force-reindex check on the global
// Scan & Index page's confirm step -- fetched once before a folder scan
// starts so the client can decide per-file whether to skip, re-index, or
// register new, without an existence round-trip per file.
export async function listVisibleGlobalDocuments(actor: Actor): Promise<DocumentRow[]> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  return db
    .select()
    .from(documents)
    .where(and(isNull(documents.caseId), inArray(documents.addedByUserId, visibleUserIds)));
}

export interface RegisterGlobalDocumentFields {
  fileName: string;
  relativePath: string;
  // The picked directory's own name, from a folder scan -- undefined for
  // a single picked file (no connected root to name). See the
  // rootFolderName column comment in packages/backend-orm/src/schema.ts.
  rootFolderName?: string;
}

export type RegisterGlobalDocumentResult = { document: DocumentRow } | { error: string; status: number };

// Backs the global Scan & Index page -- no case, unlike registerDocument
// above. Any authenticated actor may register their own caseless
// document; there's no case to check visibility against.
export async function registerGlobalDocument(actor: Actor, fields: RegisterGlobalDocumentFields): Promise<RegisterGlobalDocumentResult> {
  const fileName = fields.fileName.trim();
  const relativePath = fields.relativePath.trim();
  if (!fileName || !relativePath) {
    return { error: "fileName and relativePath are required", status: 400 };
  }
  const rootFolderName = fields.rootFolderName?.trim() || null;

  const [row] = await db
    .insert(documents)
    .values({ caseId: null, fileName, relativePath, rootFolderName, addedByUserId: actor.id })
    .returning();

  return { document: row };
}

export async function getVisibleDocumentById(actor: Actor, id: string): Promise<DocumentRow | undefined> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!row) return undefined;

  if (row.caseId === null) {
    const visibleUserIds = await getVisibleMemberUserIds(actor);
    return visibleUserIds.includes(row.addedByUserId) ? row : undefined;
  }

  const visibleCase = await getVisibleCaseById(actor, row.caseId);
  return visibleCase ? row : undefined;
}

export type DeleteDocumentResult = { success: true } | { error: string; status: number };

// Deletes the metadata row only -- there is no server-side file to clean
// up (Core Decision 2: the server never holds document content).
export async function deleteDocument(actor: Actor, id: string): Promise<DeleteDocumentResult> {
  const existing = await getVisibleDocumentById(actor, id);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  await db.delete(documents).where(eq(documents.id, id));
  return { success: true };
}
