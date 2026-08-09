import { NextResponse } from "next/server";
import { authorizeOrgSession } from "../../../../../lib/org/auth";
import { createInvitation } from "../../../../../lib/org/invitations";
import { isValidEmail } from "../../../../../lib/validation";
import type { Role } from "../../../../../lib/permissions";

// role="admin" is deliberately not invitable here -- see apps/office's
// dedicated invite-admin route (rule 2). createInvitation/canInvite also
// reject it server-side regardless of this allowlist.
const INVITABLE_ROLES: Role[] = ["manager", "user", "flat"];

export async function POST(request: Request) {
  const authorization = await authorizeOrgSession();
  if ("error" in authorization) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await request.json().catch(() => null);
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
