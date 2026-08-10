import { NextResponse } from "next/server";
import { authorizeOrgRequest } from "../../../../../../../lib/org/auth";
import { createTeam } from "../../../../../../../lib/org/teams";

// Token-in-body variant of ../../teams/route.ts's POST, for the desktop
// app's Rust layer -- same convention as the other org/desktop/* routes.
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

  const name = body?.name;
  const managerId = typeof body?.managerId === "string" ? body.managerId : undefined;
  const color = typeof body?.color === "string" ? body.color : undefined;
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const result = await createTeam(authorization.actor, { name, managerId, color });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ team: result.team }, { status: 201 });
}
