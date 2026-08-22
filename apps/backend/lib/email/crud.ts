import { eq } from "drizzle-orm";
import { db } from "../../database";
import { pendingEmailAlerts } from "../../database/schema";
import type { Actor } from "../permissions";

export type PendingEmailAlertRow = typeof pendingEmailAlerts.$inferSelect;

// Backs Home's "Needs Case Assignment" panel. Always empty today -- no
// ingestion pipeline exists yet to populate this table (Phase 6 shipped
// schema + case-matching/classification logic only, deliberately, per
// its own PR). The read path is real; the data source isn't, yet.
export async function listPendingEmailAlerts(actor: Actor): Promise<PendingEmailAlertRow[]> {
  return db.select().from(pendingEmailAlerts).where(eq(pendingEmailAlerts.userId, actor.id));
}
