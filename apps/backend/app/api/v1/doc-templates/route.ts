import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { createDocTemplate, listVisibleDocTemplates } from "../../../../lib/docTemplates/crud";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const templates = await listVisibleDocTemplates(authorization.actor);
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = (await request.json().catch(() => null)) as { title?: string; fileName?: string } | null;
  if (!body?.title || !body?.fileName) {
    return NextResponse.json({ error: "Title and file name are required" }, { status: 400 });
  }

  const result = await createDocTemplate(authorization.actor, { title: body.title, fileName: body.fileName });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ template: result.template }, { status: 201 });
}
