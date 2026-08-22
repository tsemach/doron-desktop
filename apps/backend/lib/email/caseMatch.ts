import { and, inArray, isNull } from "drizzle-orm";
import { db } from "../../database";
import { cases } from "../../database/schema";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

// Mirrors Calendar's near-exact case-linking approach (docs/calendar/
// design.md's case_link.rs / normalize_for_match), not desktop's fuller
// fuzzy case_matcher pipeline -- per Phase 6's design doc, this repo's
// newly-built surfaces stay consistent with each other rather than each
// picking its own matching strategy. Pure functions, no I/O, fully
// unit-testable without a database or any external service.

const CASE_PHRASE = /(?:case|תיק)\s*[:\-]\s*(.+?)(?:\n|$)/i;

export function extractCasePhrase(text: string): string | null {
  const match = CASE_PHRASE.exec(text);
  return match ? match[1].trim() : null;
}

// Lowercase, trim, collapse whitespace, strip common punctuation -- a
// near-exact comparison, not fuzzy matching (deliberately, per the design
// doc). Works for both Hebrew and English text since it doesn't touch
// non-ASCII characters beyond casing.
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,:;!?'"()\[\]]/g, "")
    .replace(/\s+/g, " ");
}

export async function matchCaseByPhrase(actor: Actor, phrase: string): Promise<string | null> {
  const normalized = normalizeForMatch(phrase);
  if (!normalized) return null;

  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const rows = await db
    .select({ id: cases.id, name: cases.name, subject: cases.subject })
    .from(cases)
    .where(and(isNull(cases.deletedAt), inArray(cases.userId, visibleUserIds)));

  const match = rows.find((c) => normalizeForMatch(c.name) === normalized || (c.subject && normalizeForMatch(c.subject) === normalized));
  return match?.id ?? null;
}
