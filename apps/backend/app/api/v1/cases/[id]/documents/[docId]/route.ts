import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../../../lib/org/auth";
import { deleteDocument } from "../../../../../../../lib/documents/crud";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { docId } = await params;
  const result = await deleteDocument(authorization.actor, docId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
