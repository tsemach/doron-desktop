import { NextResponse } from "next/server";
import { authorizeOrgRequest } from "../../../../../../../lib/org/auth";
import { changeUserRole } from "../../../../../../../lib/org/roster";

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
