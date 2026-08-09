import { NextResponse } from "next/server";
import { authorizeOrgRequest } from "../../../../../../lib/org/auth";
import { getMembers } from "../../../../../../lib/org/members";

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

  const members = await getMembers(authorization.actor);
  return NextResponse.json({ members, actor: authorization.actor });
}
