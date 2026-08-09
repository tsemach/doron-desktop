import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { firms } from "@workspace/backend-orm";
import { auth } from "../../../../../auth";
import { backendDb } from "../../../../../lib/backendDb";
import { isValidFirmName } from "../../../../../lib/validation";

// ASC-142 -- firm creation, decoupled from admin invitation (see
// ../invite-admin/route.ts): a firm must exist before an admin can be
// invited into it, and a firm can have multiple admins invited into it
// over time, not just one at creation time.

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await backendDb
      .select({ id: firms.id, name: firms.name, createdAt: firms.createdAt })
      .from(firms)
      .orderBy(desc(firms.createdAt));

    return NextResponse.json({ firms: rows });
  } catch (error: any) {
    console.error("Failed to list firms:", error);
    return NextResponse.json({ error: `Failed to list firms: ${error.message || String(error)}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
    }
    if (!isValidFirmName(name)) {
      return NextResponse.json({ error: "Firm name contains invalid characters." }, { status: 400 });
    }

    // firms.name has a DB-level unique constraint (the real source of
    // truth, see packages/backend-orm/src/schema.ts) -- this check exists
    // only to turn the common case into a clean 400 instead of the
    // constraint violation's raw SQL error message reaching the UI.
    const [existing] = await backendDb.select({ id: firms.id }).from(firms).where(eq(firms.name, name)).limit(1);
    if (existing) {
      return NextResponse.json({ error: "A firm with this name already exists." }, { status: 400 });
    }

    const [firm] = await backendDb
      .insert(firms)
      .values({ name })
      .returning({ id: firms.id, name: firms.name, createdAt: firms.createdAt });

    return NextResponse.json({ firm }, { status: 201 });
  } catch (error: any) {
    // Fallback for the race between the check above and the insert (two
    // concurrent requests for the same name) -- Postgres's own unique
    // constraint still catches it either way, this just keeps the error
    // message clean instead of leaking the raw SQL error.
    if (error?.code === "23505") {
      return NextResponse.json({ error: "A firm with this name already exists." }, { status: 400 });
    }
    console.error("Failed to create firm:", error);
    return NextResponse.json({ error: `Failed to create firm: ${error.message || String(error)}` }, { status: 500 });
  }
}
