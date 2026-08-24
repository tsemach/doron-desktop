import { and, cosineDistance, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../database";
import { cases, documentChunks, documents } from "../../database/schema";
import { getVisibleMemberUserIds, type Actor } from "../permissions";
import { embedText } from "../ai/embed";

export interface SearchResult {
  documentId: string;
  fileName: string;
  relativePath: string;
  // The Scan & Index page's picked directory name, when the document
  // came from a folder scan -- null for a case-scoped document, a single
  // picked file, or anything indexed before this column existed.
  rootFolderName: string | null;
  caseId: string | null;
  caseName: string | null;
  chunkText: string;
  rank: number;
  // 0-1 cosine similarity, shown as a "Match: X%" badge -- null on the
  // FTS-only fallback path (no query embedding, so nothing to compare).
  similarity: number | null;
}

function visibilityCondition(visibleUserIds: string[]): SQL {
  // Left join below means a caseless document's `cases` columns are all
  // null -- covered by the second branch (isNull(documents.caseId) +
  // addedByUserId), matching getVisibleDocumentById's same visibility
  // split (packages/backend-orm/src/schema.ts's documents.caseId comment).
  return or(
    and(inArray(cases.userId, visibleUserIds), isNull(cases.deletedAt)),
    and(isNull(documents.caseId), inArray(documents.addedByUserId, visibleUserIds))
  )!;
}

async function searchByFtsOnly(visibleUserIds: string[], tsQuery: SQL, limit: number): Promise<SearchResult[]> {
  const rank = sql<number>`ts_rank(to_tsvector('english', ${documentChunks.text}), ${tsQuery})`;

  const rows = await db
    .select({
      documentId: documents.id,
      fileName: documents.fileName,
      relativePath: documents.relativePath,
      rootFolderName: documents.rootFolderName,
      caseId: cases.id,
      caseName: cases.name,
      chunkText: documentChunks.text,
      rank,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .leftJoin(cases, eq(cases.id, documents.caseId))
    .where(and(visibilityCondition(visibleUserIds), sql`to_tsvector('english', ${documentChunks.text}) @@ ${tsQuery}`))
    .orderBy(desc(rank))
    .limit(limit);

  return rows.map((row) => ({ ...row, similarity: null }));
}

// A cosine-similarity floor below which a vector-only match (no FTS
// keyword hit at all) is treated as noise rather than a real semantic
// match. Desktop's own thresholds (query/queries.rs: 0.75 alone, or 0.68
// alongside an FTS hit) were tuned for its local fastembed/E5 model --
// not safely portable to this backend's embedding model (OpenAI's
// text-embedding-3-small via the AI Gateway, a different vector space
// with different typical similarity distributions). This is a
// conservative starting point, not an empirically-verified one; revisit
// once there's real query volume to tune against.
const VECTOR_ONLY_SIMILARITY_FLOOR = 0.5;

// Hybrid FTS + vector search, matching desktop's query_smart_execute
// (apps/desktop/src-tauri/src/query/queries.rs) in spirit: combine
// keyword rank and semantic similarity rather than FTS alone, so a
// query can surface a document that uses different words for the same
// concept. Simplified relative to desktop -- no structured filters
// (date/tags), no LLM query analysis/doc-type distribution, no fuzzy
// keyword scoring; this backend has no equivalent infrastructure for
// those yet. Falls back to FTS-only if the query embedding itself fails
// (AI quota exhausted, provider error) rather than failing the search.
export async function searchDocuments(actor: Actor, query: string, tier: "free" | "pro", limit = 20): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const visibleUserIds = await getVisibleMemberUserIds(actor);
  const tsQuery = sql`plainto_tsquery('english', ${trimmed})`;

  const embedResult = await embedText(actor.id, tier, trimmed, "query_analysis");
  if (!("vector" in embedResult)) {
    return searchByFtsOnly(visibleUserIds, tsQuery, limit);
  }

  const ftsRank = sql<number>`ts_rank(to_tsvector('english', ${documentChunks.text}), ${tsQuery})`;
  const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embedding, embedResult.vector)})`;
  const ftsHit = sql`to_tsvector('english', ${documentChunks.text}) @@ ${tsQuery}`;
  // Vector similarity dominates the combined score (0-1 range) with a
  // small FTS-rank boost on top, rather than the other way around --
  // matches desktop's own weighting (vec_score + retrieval_score/200.0).
  const combined = sql<number>`${similarity} + ${ftsRank}`;

  const rows = await db
    .select({
      documentId: documents.id,
      fileName: documents.fileName,
      relativePath: documents.relativePath,
      rootFolderName: documents.rootFolderName,
      caseId: cases.id,
      caseName: cases.name,
      chunkText: documentChunks.text,
      rank: combined,
      similarity,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documents.id, documentChunks.documentId))
    .leftJoin(cases, eq(cases.id, documents.caseId))
    .where(and(visibilityCondition(visibleUserIds), or(ftsHit, sql`${similarity} >= ${VECTOR_ONLY_SIMILARITY_FLOOR}`)))
    .orderBy(desc(combined))
    // Over-fetch chunk rows, not final results -- multiple chunks can
    // match the same document; collapsed to one (its best-scoring chunk)
    // per document below, since rows already arrive best-first.
    .limit(limit * 3);

  const byDocument = new Map<string, SearchResult>();
  for (const row of rows) {
    if (!byDocument.has(row.documentId)) {
      byDocument.set(row.documentId, row);
    }
  }

  return Array.from(byDocument.values()).slice(0, limit);
}
