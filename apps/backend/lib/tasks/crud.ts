import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../../database";
import { cases, tasks } from "../../database/schema";
import { getVisibleCaseById } from "../cases/crud";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

export type TaskRow = typeof tasks.$inferSelect;

// Tasks inherit visibility transitively through their case (Phase 1's
// design) -- every function here first re-confirms the case is visible to
// the actor (via getVisibleCaseById, itself existence-oracle-safe) before
// touching any task row, rather than trusting a caseId the caller passed.

export async function listTasksForCase(actor: Actor, caseId: string): Promise<TaskRow[]> {
  const visibleCase = await getVisibleCaseById(actor, caseId);
  if (!visibleCase) return [];

  return db.select().from(tasks).where(eq(tasks.caseId, caseId)).orderBy(asc(tasks.sortOrder), asc(tasks.dueDate));
}

export interface CreateTaskFields {
  title: string;
  description?: string;
  dueDate?: string; // ISO date
}

export type CreateTaskResult = { task: TaskRow } | { error: string; status: number };

export async function createTask(actor: Actor, caseId: string, fields: CreateTaskFields): Promise<CreateTaskResult> {
  const title = fields.title.trim();
  if (!title) {
    return { error: "Title is required", status: 400 };
  }

  const visibleCase = await getVisibleCaseById(actor, caseId);
  if (!visibleCase) {
    return { error: "Not found", status: 404 };
  }

  const [row] = await db
    .insert(tasks)
    .values({
      caseId,
      title,
      description: fields.description?.trim() || null,
      dueDate: fields.dueDate ? new Date(fields.dueDate) : null,
    })
    .returning();

  return { task: row };
}

// Looks up a task's case first (a task has no owner column of its own --
// its case does), so visibility is re-derived fresh every call rather than
// trusted from create time. Returns undefined for "task doesn't exist" and
// "task's case isn't visible to this actor" alike, same existence-oracle-
// safe convention as getVisibleCaseById.
async function getVisibleTaskById(actor: Actor, taskId: string): Promise<TaskRow | undefined> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row) return undefined;

  const visibleCase = await getVisibleCaseById(actor, row.caseId);
  return visibleCase ? row : undefined;
}

export interface UpdateTaskFields {
  title?: string;
  description?: string;
  status?: TaskRow["status"];
  dueDate?: string | null;
}

export type UpdateTaskResult = { task: TaskRow } | { error: string; status: number };

export async function updateTask(actor: Actor, taskId: string, fields: UpdateTaskFields): Promise<UpdateTaskResult> {
  const existing = await getVisibleTaskById(actor, taskId);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  const [updated] = await db
    .update(tasks)
    .set({
      title: fields.title?.trim() || existing.title,
      description: fields.description !== undefined ? fields.description.trim() || null : existing.description,
      status: fields.status ?? existing.status,
      dueDate: fields.dueDate !== undefined ? (fields.dueDate ? new Date(fields.dueDate) : null) : existing.dueDate,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  return { task: updated };
}

export type DeleteTaskResult = { success: true } | { error: string; status: number };

// Unlike cases' delete (owner-only -- a big, consequential action), a
// single task is a routine to-do-list edit -- deletion follows the same
// visibility-grants-edit rule as everything else here, no extra
// ownership restriction.
export async function deleteTask(actor: Actor, taskId: string): Promise<DeleteTaskResult> {
  const existing = await getVisibleTaskById(actor, taskId);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));
  return { success: true };
}

export type TaskUrgency = "overdue" | "due-today" | "upcoming";

export interface ImportantTask {
  id: string;
  title: string;
  caseSubject: string;
  dueAt: string;
  urgency: TaskUrgency;
}

function computeUrgency(dueDate: Date, now: Date): TaskUrgency {
  if (dueDate < now) return "overdue";
  const sameDay =
    dueDate.getFullYear() === now.getFullYear() && dueDate.getMonth() === now.getMonth() && dueDate.getDate() === now.getDate();
  return sameDay ? "due-today" : "upcoming";
}

// Backs Home's ImportantTasksCard -- a glance/read-only surface (Phase 3's
// design), so no mutation path here. Only tasks with a dueDate are
// eligible (matching desktop's own date-based urgency bucketing) and
// terminal statuses are excluded, same as desktop's "Urgent" grouping.
export async function listImportantTasks(actor: Actor, limit = 5): Promise<ImportantTask[]> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const now = new Date();

  const rows = await db
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, caseSubject: cases.name })
    .from(tasks)
    .innerJoin(cases, eq(cases.id, tasks.caseId))
    .where(
      and(
        inArray(cases.userId, visibleUserIds),
        isNull(cases.deletedAt),
        ne(tasks.status, "Done"),
        ne(tasks.status, "Cancel")
      )
    )
    .orderBy(asc(tasks.dueDate))
    .limit(limit * 4); // over-fetch since we filter null dueDate client-side below, then re-limit

  return rows
    .filter((r): r is typeof r & { dueDate: Date } => r.dueDate !== null)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.title,
      caseSubject: r.caseSubject,
      dueAt: r.dueDate.toISOString(),
      urgency: computeUrgency(r.dueDate, now),
    }));
}
