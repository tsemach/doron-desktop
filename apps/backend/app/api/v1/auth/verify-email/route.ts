import { NextResponse } from "next/server";
import { consumeEmailVerification } from "../../../../../lib/emailVerification";

export async function POST(request: Request) {
  try {
    const { email, token } = await request.json();
    if (!email || !token) {
      return NextResponse.json({ error: "Missing email or token" }, { status: 400 });
    }

    const result = await consumeEmailVerification(email, token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Verify-email error:", error);
    return NextResponse.json({ error: error.message || "Verification failed" }, { status: 500 });
  }
}
