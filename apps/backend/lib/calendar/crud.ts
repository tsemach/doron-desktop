import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../../database";
import { meetings } from "../../database/schema";
import { getVisibleCaseById } from "../cases/crud";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

export type MeetingRow = typeof meetings.$inferSelect;

// Scoped to Phase 1's schema/design only -- local, manually-created
// meetings, case-linkable. Google Calendar OAuth connection and two-way
// sync (docs/backend-saas/phase-3-core-pages/design.md's fuller vision)
// are NOT implemented here: that needs a real Google Cloud project's
// credentials to build and verify against, which isn't available in this
// pass. A meeting created here has no googleEventId and is never pushed
// to/pulled from Google -- purely local, same visibility rules as
// everything else in this stack.

// Anchored to the meeting's own userId (the creator), not derived through
// a case -- a meeting can exist without a case link at all, unlike tasks/
// documents. Case-linked meetings ALSO respect the case's own visibility
// (both conditions must hold), matching Phase 1's design note that a
// case-linked meeting's case link is metadata, but the owner is still the
// primary visibility anchor.
export async function listUpcomingMeetings(actor: Actor): Promise<MeetingRow[]> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  return db
    .select()
    .from(meetings)
    .where(and(inArray(meetings.userId, visibleUserIds), gte(meetings.startTime, new Date())))
    .orderBy(asc(meetings.startTime));
}

// Backs the Calendar page's grid -- an arbitrary [start, end) range,
// mirrors desktop's list_meetings_for_range command.
export async function listMeetingsForRange(actor: Actor, start: Date, end: Date): Promise<MeetingRow[]> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  return db
    .select()
    .from(meetings)
    .where(and(inArray(meetings.userId, visibleUserIds), gte(meetings.startTime, start), lt(meetings.startTime, end)))
    .orderBy(asc(meetings.startTime));
}

// Backs Home's "Today's Meetings" panel (mirrors desktop's AppHomeTodaysMeetings).
export async function listTodaysMeetings(actor: Actor): Promise<MeetingRow[]> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfDay);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  return db
    .select()
    .from(meetings)
    .where(and(inArray(meetings.userId, visibleUserIds), gte(meetings.startTime, startOfDay), lt(meetings.startTime, startOfTomorrow)))
    .orderBy(asc(meetings.startTime));
}

export async function listMeetingsForCase(actor: Actor, caseId: string): Promise<MeetingRow[]> {
  const visibleCase = await getVisibleCaseById(actor, caseId);
  if (!visibleCase) return [];

  return db.select().from(meetings).where(eq(meetings.caseId, caseId)).orderBy(asc(meetings.startTime));
}

export interface CreateMeetingFields {
  title: string;
  location?: string;
  startTime: string; // ISO datetime
  endTime: string; // ISO datetime
  caseId?: string;
}

export type CreateMeetingResult = { meeting: MeetingRow } | { error: string; status: number };

export async function createMeeting(actor: Actor, fields: CreateMeetingFields): Promise<CreateMeetingResult> {
  const title = fields.title.trim();
  if (!title) {
    return { error: "Title is required", status: 400 };
  }
  if (fields.caseId) {
    const visibleCase = await getVisibleCaseById(actor, fields.caseId);
    if (!visibleCase) {
      return { error: "Case not found", status: 404 };
    }
  }

  const [row] = await db
    .insert(meetings)
    .values({
      userId: actor.id,
      caseId: fields.caseId ?? null,
      title,
      location: fields.location?.trim() || null,
      startTime: new Date(fields.startTime),
      endTime: new Date(fields.endTime),
      caseLinkSource: fields.caseId ? "manual" : "none",
      // No googleEventId -- purely local. Drizzle's schema requires this
      // column NOT NULL + unique for real Google-synced rows; a locally-
      // created meeting gets a generated placeholder so the column stays
      // populated without colliding with a real future Google sync.
      googleEventId: `local-${crypto.randomUUID()}`,
    })
    .returning();

  return { meeting: row };
}

async function getVisibleMeetingById(actor: Actor, id: string): Promise<MeetingRow | undefined> {
  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const [row] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, id), inArray(meetings.userId, visibleUserIds)))
    .limit(1);
  return row;
}

export interface UpdateMeetingFields {
  title?: string;
  location?: string;
  startTime?: string; // ISO datetime
  endTime?: string; // ISO datetime
  caseId?: string | null;
}

export type UpdateMeetingResult = { meeting: MeetingRow } | { error: string; status: number };

// Backs the edit dialog opened by clicking an existing meeting -- only
// the fields the client actually sends are touched, everything else on
// the row is left as-is.
export async function updateMeeting(actor: Actor, id: string, fields: UpdateMeetingFields): Promise<UpdateMeetingResult> {
  const existing = await getVisibleMeetingById(actor, id);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }
  if (fields.caseId) {
    const visibleCase = await getVisibleCaseById(actor, fields.caseId);
    if (!visibleCase) {
      return { error: "Case not found", status: 404 };
    }
  }

  const updates: Partial<typeof meetings.$inferInsert> = { updatedAt: new Date() };
  if (fields.title !== undefined) {
    const title = fields.title.trim();
    if (!title) return { error: "Title is required", status: 400 };
    updates.title = title;
  }
  if (fields.location !== undefined) updates.location = fields.location.trim() || null;
  if (fields.startTime !== undefined) updates.startTime = new Date(fields.startTime);
  if (fields.endTime !== undefined) updates.endTime = new Date(fields.endTime);
  if (fields.caseId !== undefined) updates.caseId = fields.caseId || null;

  const [row] = await db.update(meetings).set(updates).where(eq(meetings.id, id)).returning();
  return { meeting: row };
}

export type DeleteMeetingResult = { success: true } | { error: string; status: number };

export async function deleteMeeting(actor: Actor, id: string): Promise<DeleteMeetingResult> {
  const existing = await getVisibleMeetingById(actor, id);
  if (!existing) {
    return { error: "Not found", status: 404 };
  }

  await db.delete(meetings).where(eq(meetings.id, id));
  return { success: true };
}
