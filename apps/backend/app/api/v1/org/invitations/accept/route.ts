import { NextResponse } from "next/server";
import { acceptInvitation } from "../../../../../../lib/org/invitations";
import { isValidFullName, isValidPasswordLength } from "../../../../../../lib/validation";

// Public (no auth) -- the invitee has no account yet. Mirrors
// app/api/v1/auth/signup/route.ts's validation, plus the token itself.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const fullName = body?.fullName;
  const password = body?.password;

  if (!token || !fullName || !password) {
    return NextResponse.json({ error: "Missing token, fullName, or password" }, { status: 400 });
  }
  if (!isValidFullName(fullName)) {
    return NextResponse.json({ error: "Full name contains invalid characters." }, { status: 400 });
  }
  if (!isValidPasswordLength(password)) {
    return NextResponse.json({ error: "Password must be between 6 and 16 characters long." }, { status: 400 });
  }

  const result = await acceptInvitation(token, { fullName, password });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, user: result.user }, { status: 201 });
}
