import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { createTeam, listTeams } from "../../../../../lib/org/teams";

export async function GET() {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const teams = await listTeams(authorization.actor);
  return NextResponse.json({ teams });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await request.json().catch(() => null);
  const name = body?.name;
  const managerId = typeof body?.managerId === "string" ? body.managerId : undefined;
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const result = await createTeam(authorization.actor, { name, managerId });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ team: result.team }, { status: 201 });
}
