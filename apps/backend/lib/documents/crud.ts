import { asc, eq } from "drizzle-orm";
import { db } from "../../database";
import { documents } from "../../database/schema";
import { getVisibleCaseById } from "../cases/crud";
import type { Actor } from "../permissions";

export type DocumentRow = typeof documents.$inferSelect;

// Documents inherit visibility transitively through their case, same
// pattern as tasks/meetings (Phase 1's design). relativePath is a path
// relative to the case's connected local folder root -- never an
// absolute path (the File System Access API doesn't expose one, by spec)
// and never a way for this server to read the file's actual content; see
// docs/backend-saas/phase-4-local-documents/design.md. This table only
// ever receives fileName/relativePath metadata, POSTed by the browser
// after it walks the locally-granted directory handle.

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

export async function getVisibleDocumentById(actor: Actor, id: string): Promise<DocumentRow | undefined> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!row) return undefined;

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
