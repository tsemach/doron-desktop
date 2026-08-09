import { NextResponse } from "next/server";
import { authorizeOrgRequest } from "../../../../../../lib/org/auth";
import { createInvitation } from "../../../../../../lib/org/invitations";
import { isValidEmail } from "../../../../../../lib/validation";
import type { Role } from "../../../../../../lib/permissions";

// Token-in-body variant of ../invitations/route.ts, for the desktop app's
// Rust layer (mirrors login_with_credentials/verify_session's convention --
// no Bearer header anywhere in this codebase). Shares all business logic
// with the cookie route via lib/org/invitations.ts; only auth extraction differs.
const INVITABLE_ROLES: Role[] = ["manager", "user", "flat"];

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

  const email = body?.email;
  const role = body?.role;
  const teamId = typeof body?.teamId === "string" ? body.teamId : undefined;

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const result = await createInvitation(authorization.actor, { email, role, teamId }, origin);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, invitationId: result.invitation.id }, { status: 201 });
}
