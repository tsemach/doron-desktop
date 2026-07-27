import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { auth } from "../../../../../auth";
import { db } from "../../../../../database";
import { adminUsers } from "../../../../../database/schema";
import { isValidEmail, isValidFullName, isValidPasswordLength } from "../../../../../lib/validation";

export async function POST(request: Request) {
  // middleware.ts doesn't cover /api routes, so this is the only gate --
  // only an already-signed-in admin may create another admin account.
  // Admins are never self-service (see auth.ts's OAuth signIn callback).
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { fullName, email, password } = await request.json();

    if (!fullName || !email || !password) {
      return NextResponse.json({ error: "Missing required fields: fullName, email, and password" }, { status: 400 });
    }
    if (!isValidFullName(fullName)) {
      return NextResponse.json({ error: "Full name contains invalid characters." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!isValidPasswordLength(password)) {
      return NextResponse.json({ error: "Password must be between 6 and 16 characters long." }, { status: 400 });
    }

    const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (existing) {
      return NextResponse.json({ error: "An admin account with this email address already exists" }, { status: 400 });
    }

    const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

    // No email verification step -- unlike apps/backend's self-service
    // signup, this account was just vouched for by an already-authenticated
    // admin, so it's usable immediately.
    const [newAdmin] = await db
      .insert(adminUsers)
      .values({ name: fullName, email, passwordHash })
      .returning({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email, createdAt: adminUsers.createdAt });

    return NextResponse.json({ success: true, user: newAdmin }, { status: 201 });
  } catch (error: any) {
    console.error("Admin creation error:", error);
    return NextResponse.json({ error: error.message || "Failed to create admin account" }, { status: 500 });
  }
}
