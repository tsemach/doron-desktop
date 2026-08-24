import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { deleteDocTemplate } from "../../../../../lib/docTemplates/crud";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const result = await deleteDocTemplate(authorization.actor, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
