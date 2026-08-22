import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { createCase, listVisibleCases } from "../../../../lib/cases/crud";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const cases = await listVisibleCases(authorization.actor);
  return NextResponse.json({ cases });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = (await request.json().catch(() => null)) as { name?: string; subject?: string } | null;
  if (!body?.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const result = await createCase(authorization.actor, { name: body.name, subject: body.subject });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ case: result.case }, { status: 201 });
}
