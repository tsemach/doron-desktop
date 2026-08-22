import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database";
import { caseTemplates } from "../../database/schema";
import type { Actor } from "../permissions";

export type CaseTemplateRow = typeof caseTemplates.$inferSelect;

// Templates are firm-owned (or personal for flat users) -- unlike cases,
// not derived from a user relationship, so a template survives a user
// leaving the firm (see docs/backend-saas/phase-1-data-foundation/design.md).
// Visibility is a direct firmId/userId match, no getVisibleMemberUserIds
// roll-up needed -- a template belongs to the firm as a whole, not to
// whoever currently manages which team.
export async function listVisibleCaseTemplates(actor: Actor): Promise<CaseTemplateRow[]> {
  const scope = actor.firmId ? eq(caseTemplates.firmId, actor.firmId) : eq(caseTemplates.userId, actor.id);
  return db.select().from(caseTemplates).where(scope).orderBy(desc(caseTemplates.createdAt));
}

// Per docs/backend-saas/phase-3-core-pages/design.md: firm templates are a
// shared library admin/manager manage; other firm roles can only use them.
// Flat users always manage their own personal templates freely (no
// admin/manager concept applies to a flat account).
export function canManageTemplates(actor: Actor): boolean {
  return actor.firmId === null || actor.role === "admin" || actor.role === "manager";
}

export interface CreateCaseTemplateFields {
  name: string;
}

export type CreateCaseTemplateResult = { template: CaseTemplateRow } | { error: string; status: number };

export async function createCaseTemplate(actor: Actor, fields: CreateCaseTemplateFields): Promise<CreateCaseTemplateResult> {
  if (!canManageTemplates(actor)) {
    return { error: "Only an admin or manager can manage firm templates", status: 403 };
  }
  const name = fields.name.trim();
  if (!name) {
    return { error: "Name is required", status: 400 };
  }

  const [row] = await db
    .insert(caseTemplates)
    .values({
      firmId: actor.firmId,
      userId: actor.firmId ? null : actor.id,
      createdByUserId: actor.id,
      name,
    })
    .returning();

  return { template: row };
}

export type DeleteCaseTemplateResult = { success: true } | { error: string; status: number };

export async function deleteCaseTemplate(actor: Actor, id: string): Promise<DeleteCaseTemplateResult> {
  if (!canManageTemplates(actor)) {
    return { error: "Only an admin or manager can manage firm templates", status: 403 };
  }

  const scope = actor.firmId ? eq(caseTemplates.firmId, actor.firmId) : eq(caseTemplates.userId, actor.id);
  const [existing] = await db
    .select({ id: caseTemplates.id })
    .from(caseTemplates)
    .where(and(eq(caseTemplates.id, id), scope))
    .limit(1);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  await db.delete(caseTemplates).where(eq(caseTemplates.id, id));
  return { success: true };
}
