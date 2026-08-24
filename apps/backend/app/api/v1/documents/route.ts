import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { listVisibleGlobalDocuments, registerGlobalDocument } from "../../../../lib/documents/crud";

// Registers/lists caseless documents -- backs the global Scan & Index
// page. Case-scoped registration still goes through
// /api/v1/cases/[id]/documents.
export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const documents = await listVisibleGlobalDocuments(authorization.actor);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = (await request.json().catch(() => null)) as { fileName?: string; relativePath?: string; rootFolderName?: string } | null;
  if (!body?.fileName || !body.relativePath) {
    return NextResponse.json({ error: "fileName and relativePath are required" }, { status: 400 });
  }

  const result = await registerGlobalDocument(authorization.actor, {
    fileName: body.fileName,
    relativePath: body.relativePath,
    rootFolderName: body.rootFolderName,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ document: result.document }, { status: 201 });
}
