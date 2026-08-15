import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";

// Session (auth.config.ts) intentionally stays lean (name/email/id/tier) --
// the profile page needs a couple of fields beyond that (emailVerified,
// createdAt), so it gets its own small fetch instead of growing the JWT.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [user] = await db
      .select({
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        tier: users.tier,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to load profile" }, { status: 500 });
  }
}

const VALID_LOCALES = ["en", "he"];
const VALID_FONTS = ["plex", "assistant", "noto", "frank", "rubik", "heebo"];

// ASC-157 -- persists the Profile > Preferences panel (language + interface
// font), same auth-check-then-update shape as select-plan/route.ts. Not
// reflected on session.user until the next full page load (auth.ts's
// session callback re-fetches locale/interfaceFont fresh, but only on that
// Node-runtime path, not via token rotation) -- same lag tier/role already
// have; the LanguageContext/FontContext client state updates immediately
// regardless, so the UI doesn't wait on it.
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { locale, interfaceFont } = await request.json();
    if (!VALID_LOCALES.includes(locale)) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }
    if (!VALID_FONTS.includes(interfaceFont)) {
      return NextResponse.json({ error: "Invalid interfaceFont" }, { status: 400 });
    }

    await db.update(users).set({ locale, interfaceFont }).where(eq(users.id, session.user.id));

    return NextResponse.json({ locale, interfaceFont });
  } catch (error: any) {
    console.error("Profile preferences update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update preferences" }, { status: 500 });
  }
}
