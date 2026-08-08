import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { getRoster } from "../../../../../lib/org/roster";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const roster = await getRoster(authorization.actor);
  return NextResponse.json({ roster, actor: authorization.actor });
}
