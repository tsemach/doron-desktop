import { NextResponse } from "next/server";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { createEmailVerification } from "../../../../../lib/emailVerification";
import { isValidEmail, isValidFullName, isValidPasswordLength } from "../../../../../lib/validation";

export async function POST(request: Request) {
  try {
    const { fullName, email, password, platform } = await request.json();

    // Basic Validation
    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields: fullName, email, and password" },
        { status: 400 }
      )
    }

    // Server-side is the enforcement source of truth -- the client-side
    // checks in register/page.tsx are only for immediate UX feedback and
    // can't be trusted on their own.
    if (!isValidFullName(fullName)) {
      return NextResponse.json(
        { error: "Full name contains invalid characters." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!isValidPasswordLength(password)) {
      return NextResponse.json(
        { error: "Password must be between 6 and 16 characters long." },
        { status: 400 }
      );
    }

    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email address already exists" },
        { status: 400 }
      );
    }

    // Hash the password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // Create the user (emailVerified stays null until they click the
    // verification link -- login is blocked until then, see verifyCredentials.ts)
    const [newUser] = await db
      .insert(users)
      .values({
        name: fullName,
        email: email,
        passwordHash: passwordHash,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      });

    // If sending the verification email fails (e.g. the configured Resend
    // domain isn't verified yet), roll back the user row we just created --
    // otherwise it's stuck forever: unverified (so login stays blocked) and
    // unretriable (a second signup attempt hits "account already exists"),
    // with no way out except manual DB cleanup.
    try {
      const origin = new URL(request.url).origin;
      await createEmailVerification(email, origin, platform);
    } catch (verificationError: any) {
      await db.delete(users).where(eq(users.id, newUser.id));
      throw new Error(
        `Account created but the verification email failed to send: ${verificationError.message}. Please try registering again.`
      );
    }

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error("Sign-up error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create user account" },
      { status: 500 }
    );
  }
}
