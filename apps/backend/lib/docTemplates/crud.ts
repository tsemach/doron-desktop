import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database";
import { caseDocTemplates } from "../../database/schema";
import type { Actor } from "../permissions";
import { canManageTemplates } from "../templates/crud";

export type CaseDocTemplateRow = typeof caseDocTemplates.$inferSelect;

// Desktop's doc_templates concept: an individual, placeholder-fillable
// document template (e.g. a Word file), distinct from a case template
// (lib/templates/crud.ts), which composes a collection of these via
// case_template_docs. Same firm-owned/personal visibility shape and
// admin/manager management rule as case templates, so canManageTemplates
// is reused as-is rather than duplicated.
export async function listVisibleDocTemplates(actor: Actor): Promise<CaseDocTemplateRow[]> {
  const scope = actor.firmId ? eq(caseDocTemplates.firmId, actor.firmId) : eq(caseDocTemplates.userId, actor.id);
  return db.select().from(caseDocTemplates).where(scope).orderBy(desc(caseDocTemplates.createdAt));
}

export interface CreateDocTemplateFields {
  title: string;
  fileName: string;
}

export type CreateDocTemplateResult = { template: CaseDocTemplateRow } | { error: string; status: number };

// Metadata-only for this pass, matching case templates' current scope --
// no file upload/placeholder extraction (desktop's real doc_template
// pipeline) is wired up here yet.
export async function createDocTemplate(actor: Actor, fields: CreateDocTemplateFields): Promise<CreateDocTemplateResult> {
  if (!canManageTemplates(actor)) {
    return { error: "Only an admin or manager can manage firm templates", status: 403 };
  }
  const title = fields.title.trim();
  const fileName = fields.fileName.trim();
  if (!title || !fileName) {
    return { error: "Title and file name are required", status: 400 };
  }

  const [row] = await db
    .insert(caseDocTemplates)
    .values({
      firmId: actor.firmId,
      userId: actor.firmId ? null : actor.id,
      createdByUserId: actor.id,
      title,
      fileName,
    })
    .returning();

  return { template: row };
}

export type DeleteDocTemplateResult = { success: true } | { error: string; status: number };

export async function deleteDocTemplate(actor: Actor, id: string): Promise<DeleteDocTemplateResult> {
  if (!canManageTemplates(actor)) {
    return { error: "Only an admin or manager can manage firm templates", status: 403 };
  }

  const scope = actor.firmId ? eq(caseDocTemplates.firmId, actor.firmId) : eq(caseDocTemplates.userId, actor.id);
  const [existing] = await db
    .select({ id: caseDocTemplates.id })
    .from(caseDocTemplates)
    .where(and(eq(caseDocTemplates.id, id), scope))
    .limit(1);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  await db.delete(caseDocTemplates).where(eq(caseDocTemplates.id, id));
  return { success: true };
}
