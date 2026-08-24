import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { deleteMeeting, updateMeeting } from "../../../../../lib/calendar/crud";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { title?: string; location?: string; startTime?: string; endTime?: string; caseId?: string | null }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await updateMeeting(authorization.actor, id, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ meeting: result.meeting });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { id } = await params;
  const result = await deleteMeeting(authorization.actor, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
