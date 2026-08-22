import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { searchDocuments } from "../../../../lib/search/crud";

export async function GET(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchDocuments(authorization.actor, query);
  return NextResponse.json({ results });
}
