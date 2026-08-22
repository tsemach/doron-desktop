import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../lib/org/auth";
import { createMeeting, listUpcomingMeetings } from "../../../../lib/calendar/crud";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const meetings = await listUpcomingMeetings(authorization.actor);
  return NextResponse.json({ meetings });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { title?: string; location?: string; startTime?: string; endTime?: string; caseId?: string }
    | null;
  if (!body?.title || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: "Title, start time, and end time are required" }, { status: 400 });
  }

  const result = await createMeeting(authorization.actor, {
    title: body.title,
    location: body.location,
    startTime: body.startTime,
    endTime: body.endTime,
    caseId: body.caseId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ meeting: result.meeting }, { status: 201 });
}
