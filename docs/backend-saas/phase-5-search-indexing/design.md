# Phase 5: Search & indexing — design

**Linear issue:** [ASC-185](https://linear.app/amicusx/issue/ASC-185) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
**Status:** Design — not yet implemented.
**Date:** 2026-08-22

Covers **Phase 5 only**, per
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) (PR-5,
stacked on PR-4). Implements Core Decision 3: extracted text/embeddings/
metadata persisted server-side per tenant; raw files never are.

## Goals

- Resolve the master plan's flagged open question — reuse desktop's Rust
  extractor/embeddings as a service, or reimplement in Node — with an
  actual decision, not another deferral.
- Give search/browse a real backend, working across devices without the
  local mount present (per Core Decision 3), built on Phase 4's discovered
  `documents` rows.

## Non-goals

- Actual code — decision doc only, matching the rest of this stack.
- Replicating desktop's exact hybrid-search ranking algorithm
  (`query/queries.rs`) — Phase 5 commits to the storage/generation
  architecture below; ranking-formula tuning is implementation-PR detail.

## Decision: the Rust-vs-Node question dissolves — neither

Phase 4 established that **the server never receives raw file bytes** —
`FileSystemHandle`s are client-side-only. That forces **text extraction to
happen in the browser**, full stop: neither a reused Rust service nor a
Node reimplementation is reachable, because the server has nothing to feed
either one. This isn't a preference, it's a consequence already locked in
by Phase 4's architecture.

That leaves **embedding generation** as the only real "where does this run"
question — and research found `apps/backend` already has exactly the
infrastructure this needs, unused by this project so far but clearly built
for it: `apps/backend/app/api/v1/ai/complete/route.ts` proxies through
Vercel AI Gateway (`gateway()` + `streamText()` from the `ai` SDK), with
full auth (`authorizeRequest`), quota enforcement (`checkQuota`), and
billing (`recordUsage`/`recordAiRequest`) already wired up — and its
`purpose` enum (`apps/backend/lib/ai/purpose.ts:2-9`) **already reserves
`"doc_indexing"` and `"query_analysis"`**, unused today. This wasn't built
for Phase 5, but it was clearly anticipated.

**Decision: add a sibling `/api/v1/ai/embed` route, mirroring `/complete`'s
exact shape** (`authorizeRequest` → `resolveGatewayModel`-equivalent for
embedding models → `checkQuota` → call → `recordUsage`/`recordAiRequest`
with `purpose: "doc_indexing"`) but calling the AI SDK's `embed()`/
`embedMany()` instead of `streamText()`, returning a plain JSON vector
array instead of an NDJSON stream (no reason to stream a fixed-size
embedding response). This is a **reuse**, not a new architecture — same
auth, same quota/billing, same Gateway plumbing, one new function inside
`lib/ai/`.

## Data flow

1. Browser extracts text from a document discovered in Phase 4, using the
   file already available via the client-side `FileSystemFileHandle` —
   client-side libraries per type (PDF.js for `.pdf`, a browser-compatible
   `.docx` text extractor, a browser-compatible `.xlsx` parser, trivial for
   `.txt`) — a genuinely different stack from desktop's Rust extractors
   (`extractor/docx.rs` etc.), not reusable code, by the same forced
   client-side constraint as embedding's server-side-reuse point above.
2. Browser chunks the extracted text (mirroring desktop's chunking
   granularity from `document_chunks`) and POSTs the chunks to a new
   `apps/backend/app/api/v1/documents/[id]/index` route.
3. That route calls the new embedding function once per chunk (or batched
   via `embedMany()`), gets vectors back, and writes rows into a new
   `documentChunks` table (Phase 1's design already named this as Phase
   5's target: FK'd to `documents.id`, following the transitive-visibility-
   through-case pattern — no independent ownership column).
4. Full-text search doesn't need any of this — Postgres's native
   `tsvector`/`to_tsvector` + a GIN index on `documentChunks.text` handles
   the FTS half directly, no LLM call involved.
5. Vector storage/query uses the `pgvector` Postgres extension (must be
   enabled on the Neon/Postgres instance — an infra prerequisite to flag
   for the implementation PR, not assumed already on).

## Schema addition (extends Phase 1's `documents` table)

```ts
export const documentChunks = pgTable("document_chunks", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  documentId: t.uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex: t.integer("chunk_index").notNull(),
  text: t.text("text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }), // pgvector; exact dimension pinned to whichever embedding model the implementation PR selects via the Gateway
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
}));
```

No `userId`/`firmId` on this table — visibility is transitive through
`documents.caseId` → `cases.userId`, same pattern Phase 1 established for
`tasks`.

## What this unblocks

Phase 6's email-case-matching could eventually reuse the same `/embed`
route for semantic matching, though that's not committed to here. Real,
persisted, cross-device search for the Documents page built in Phase 4.

## Open risks / follow-ups

- Exact embedding model/dimension choice, chunk size, and ranking-formula
  weighting between FTS and vector scores are implementation-PR detail —
  this document commits to the architecture (client-side extraction,
  Gateway-proxied embedding, pgvector storage), not the tuning.
- `pgvector` extension availability on the target Postgres instance should
  be confirmed before the implementation PR starts, not assumed.
