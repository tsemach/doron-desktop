import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { firms, invitations } from "@workspace/backend-orm";
import { auth } from "../../../../../auth";
import { backendDb } from "../../../../../lib/backendDb";
import { getEmailProvider } from "../../../../../lib/email";
import { isValidEmail, isValidFullName } from "../../../../../lib/validation";

// ASC-142 rule 2 -- the *only* code path in the system allowed to create a
// role="admin" invitation. The firm-facing invite API in apps/backend
// (lib/permissions.ts's canInvite) rejects role="admin" unconditionally
// regardless of actor, by design -- an admin account can only ever
// originate here, from an already-authenticated office staff member
// vouching for it. middleware.ts doesn't cover /api/*, so this route
// checks the session itself (same as app/api/v1/admin/register).
//
// Takes an existing firmId rather than a firmName -- a firm must already
// exist (create one via POST /api/v1/org/firms first). This is deliberately
// decoupled from firm creation: a firm can have multiple admins invited
// over time, not just one at firm-creation time.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches apps/backend/lib/org/invitations.ts

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { fullName, email, firmId } = await request.json();

    if (!fullName || !email || !firmId) {
      return NextResponse.json({ error: "Missing required fields: fullName, email, and firmId" }, { status: 400 });
    }
    if (!isValidFullName(fullName)) {
      return NextResponse.json({ error: "Full name contains invalid characters." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const [firm] = await backendDb.select({ id: firms.id }).from(firms).where(eq(firms.id, firmId)).limit(1);
    if (!firm) {
      return NextResponse.json({ error: "Firm not found. Create it first." }, { status: 404 });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const [invitation] = await backendDb
      .insert(invitations)
      .values({
        email,
        role: "admin",
        firmId: firm.id,
        token,
        expiresAt,
        // No invitedByUserId -- office staff aren't rows in apps/backend's
        // `users` table, only in office's own separate admin_users.
      })
      .returning({ id: invitations.id });

    // Deliberately NOT new URL(request.url).origin -- that's this office
    // app's own origin, but the accept-invite page lives in apps/backend
    // (the invitee has no relationship to the office app at all).
    const backendOrigin = process.env.BACKEND_APP_URL || "http://localhost:3000";
    const acceptUrl = `${backendOrigin}/accept-invite?token=${token}`;
    await getEmailProvider().sendInvitationEmail(email, acceptUrl, "admin");

    return NextResponse.json({ success: true, invitationId: invitation.id }, { status: 201 });
  } catch (error: any) {
    console.error("Invite-admin error:", error);
    return NextResponse.json({ error: error.message || "Failed to send invitation" }, { status: 500 });
  }
}
