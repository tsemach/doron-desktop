import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../../lib/org/auth";
import { softDeleteUser } from "../../../../../../lib/org/members";

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const result = await softDeleteUser(authorization.actor, userId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
