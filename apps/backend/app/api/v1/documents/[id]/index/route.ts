import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "../../../../../../auth";
import { db } from "../../../../../../database";
import { documentChunks } from "../../../../../../database/schema";
import { authorizeOrgSession } from "../../../../../../lib/org/auth";
import { getVisibleDocumentById } from "../../../../../../lib/documents/crud";
import { embedText } from "../../../../../../lib/ai/embed";

// Receives extracted text from the browser (client-side extraction --
// docs/backend-saas/phase-5-search-indexing/design.md's forced constraint,
// the server never gets raw file bytes) and does the parts that
// legitimately belong server-side: chunking, embedding via the AI
// Gateway, and persisting to document_chunks. Idempotent -- re-indexing a
// document replaces its existing chunks rather than duplicating them.

const CHUNK_SIZE = 1000; // characters, non-overlapping -- a v1 default; overlap/size tuning is implementation detail, not committed to here

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const chunk = text.slice(i, i + CHUNK_SIZE).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const doc = await getVisibleDocumentById(authorization.actor, id);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  if (!body?.text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Tier from the session, not re-fetched fresh from `users` -- same
  // convention app/app/layout.tsx already uses for tier specifically
  // (unlike authorizeOrgSession's role/firmId, which IS re-fetched fresh;
  // tier changes are rare enough that this codebase already treats it
  // differently elsewhere).
  const session = await auth();
  const tier = ((session?.user as { tier?: string } | undefined)?.tier as "free" | "pro" | undefined) ?? "free";

  const chunks = chunkText(body.text);
  const embedded: { chunkIndex: number; text: string; embedding: number[] }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const result = await embedText(authorization.actor.id, tier, chunks[i]);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    embedded.push({ chunkIndex: i, text: chunks[i], embedding: result.vector });
  }

  await db.transaction(async (tx) => {
    await tx.delete(documentChunks).where(and(eq(documentChunks.documentId, id)));
    if (embedded.length > 0) {
      await tx.insert(documentChunks).values(embedded.map((c) => ({ documentId: id, ...c })));
    }
  });

  return NextResponse.json({ chunksIndexed: embedded.length });
}
