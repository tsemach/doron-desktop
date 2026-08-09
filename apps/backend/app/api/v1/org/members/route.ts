import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { getMembers } from "../../../../../lib/org/members";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const members = await getMembers(authorization.actor);
  return NextResponse.json({ members, actor: authorization.actor });
}
