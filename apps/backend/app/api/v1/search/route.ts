import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { searchDocuments } from "../../../../lib/search/crud";

export async function GET(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  // Tier from the session, matching /api/v1/documents/[id]/index's same
  // convention -- needed for the query embedding's quota check.
  const session = await auth();
  const tier = ((session?.user as { tier?: string } | undefined)?.tier as "free" | "pro" | undefined) ?? "free";

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchDocuments(authorization.actor, query, tier);
  return NextResponse.json({ results });
}
