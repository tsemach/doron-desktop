import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../../lib/org/auth";
import { listDocumentsForCase, registerDocument } from "../../../../../../lib/documents/crud";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const documents = await listDocumentsForCase(authorization.actor, id);
  return NextResponse.json({ documents });
}

export async function POST(request: Request, { params }: RouteParams) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { fileName?: string; relativePath?: string } | null;
  if (!body?.fileName || !body.relativePath) {
    return NextResponse.json({ error: "fileName and relativePath are required" }, { status: 400 });
  }

  const result = await registerDocument(authorization.actor, id, { fileName: body.fileName, relativePath: body.relativePath });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ document: result.document }, { status: 201 });
}
