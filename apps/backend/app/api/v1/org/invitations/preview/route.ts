import { NextResponse } from "next/server";
import { getInvitationPreview } from "../../../../../../lib/org/invitations";

// Public (no auth) -- backs the accept-invite web page's initial render,
// before the invitee has any account/session. Token-in-body, matching this
// repo's existing convention for single-use link tokens (see
// app/api/v1/auth/verify-email/route.ts).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await getInvitationPreview(token);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
