CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- FTS half of the hybrid search (docs/backend-saas/phase-5-search-indexing/design.md):
-- Postgres's native tsvector, no LLM call involved. An expression index
-- (not a stored generated column) -- simplest option that still lets
-- Postgres use it via to_tsvector('english', text) @@ query in a WHERE
-- clause, revisit if a generated column proves necessary later.
CREATE INDEX IF NOT EXISTS "document_chunks_text_fts_idx" ON "document_chunks" USING gin (to_tsvector('english', "text"));