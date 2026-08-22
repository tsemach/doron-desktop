import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../database";
import { cases, documentChunks, documents } from "../../database/schema";
import { getVisibleMemberUserIds, type Actor } from "../permissions";

export interface SearchResult {
  documentId: string;
  fileName: string;
  caseId: string;
  caseName: string;
  chunkText: string;
  rank: number;
}

// FTS-only for v1 -- Postgres's native tsvector, no LLM call, matching
// docs/backend-saas/phase-5-search-indexing/design.md's "no LLM call
// involved" line for the FTS half. Vector-based semantic re-ranking is a
// natural fast-follow (embeddings already exist in document_chunks once
// the indexing route runs), not implemented here -- the design doc
// explicitly left ranking-weight tuning as implementation detail, and
// shipping FTS-only first is independently verifiable without needing a
// second query path to already work.
export async function searchDocuments(actor: Actor, query: string, limit = 20): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const tsQuery = sql`plainto_tsquery('english', ${trimmed})`;
  const rank = sql<number>`ts_rank(to_tsvector('english', ${documentChunks.text}), ${tsQuery})`;

  const rows = await db
    .select({
      documentId: documents.id,
      fileName: documents.fileName,
      caseId: cases.id,
      caseName: cases.name,
      chunkText: documentChunks.text,
      rank,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .innerJoin(cases, eq(cases.id, documents.caseId))
    .where(
      and(
        inArray(cases.userId, visibleUserIds),
        isNull(cases.deletedAt),
        sql`to_tsvector('english', ${documentChunks.text}) @@ ${tsQuery}`
      )
    )
    .orderBy(desc(rank))
    .limit(limit);

  return rows;
}
