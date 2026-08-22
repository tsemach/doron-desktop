import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { listMeetingsForRange } from "../../../../../lib/calendar/crud";

export async function GET(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }

  const meetings = await listMeetingsForRange(authorization.actor, new Date(start), new Date(end));
  return NextResponse.json({ meetings });
}
