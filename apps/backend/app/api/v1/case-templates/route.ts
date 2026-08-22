import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { createCaseTemplate, listVisibleCaseTemplates } from "../../../../lib/templates/crud";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const templates = await listVisibleCaseTemplates(authorization.actor);
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  if (!body?.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const result = await createCaseTemplate(authorization.actor, { name: body.name });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ template: result.template }, { status: 201 });
}
