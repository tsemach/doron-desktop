import { NextResponse } from "next/server";
import { createDesktopSession } from "../../../../../lib/desktopSession";
import { verifyCredentials } from "../../../../../lib/verifyCredentials";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    const result = await verifyCredentials(email, password);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    const { user } = result;

    const { token, expiresAt } = await createDesktopSession(user.id);

    return NextResponse.json({
      token,
      email: user.email,
      tier: user.tier,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Desktop login error:", error);
    return NextResponse.json({ error: error.message || "Login failed" }, { status: 500 });
  }
}
