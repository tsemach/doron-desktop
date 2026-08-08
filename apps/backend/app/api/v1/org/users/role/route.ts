import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../../lib/org/auth";
import { changeUserRole } from "../../../../../../lib/org/roster";

// POST (not PATCH /users/[id]) -- avoids a dynamic route segment, matching
// this repo's existing action-endpoint convention (desktop-login,
// desktop-session, select-plan, ...) over strict REST.
export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const role = body?.role;
  if (!userId || (role !== "manager" && role !== "user")) {
    return NextResponse.json({ error: "Missing userId, or role must be 'manager' or 'user'." }, { status: 400 });
  }

  const result = await changeUserRole(authorization.actor, userId, role);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ user: result.user });
}
