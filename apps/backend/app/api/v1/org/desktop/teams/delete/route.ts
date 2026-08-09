import { NextResponse } from "next/server";
import { authorizeOrgRequest } from "../../../../../../../lib/org/auth";
import { deleteTeam } from "../../../../../../../lib/org/teams";

// Token-in-body variant for the desktop app's Rust layer -- same convention
// as ../create/route.ts and the other org/desktop/* routes.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const authorization = await authorizeOrgRequest(token);
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const teamId = body?.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
  }

  const result = await deleteTeam(authorization.actor, teamId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
