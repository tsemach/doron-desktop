import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { users } from "@workspace/backend-orm";
import { auth } from "../../../auth";
import { backendDb } from "../../../lib/backendDb";

// Admin CRUD over apps/backend's `users` table (Ascurix customers), reached
// through the shared @workspace/backend-orm schema + office's own
// BACKEND_DATABASE_URL connection (lib/backendDb.ts). Session-gated like
// app/api/templates/route.ts, since middleware.ts doesn't cover /api routes.

const EDITABLE_FIELDS = ["name", "email", "tier", "image", "emailVerified", "planSelectedAt"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await backendDb
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        tier: users.tier,
        image: users.image,
        emailVerified: users.emailVerified,
        planSelectedAt: users.planSelectedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ users: rows });
  } catch (error: any) {
    console.error("Failed to query backend users:", error);
    return NextResponse.json({ error: `Failed to list users: ${error.message || String(error)}` }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return new NextResponse("Missing user id", { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        updates[field] = field === "emailVerified" || field === "planSelectedAt"
          ? (body[field] ? new Date(body[field]) : null)
          : body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return new NextResponse("No editable fields provided", { status: 400 });
    }

    const [updated] = await backendDb
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        tier: users.tier,
        image: users.image,
        emailVerified: users.emailVerified,
        planSelectedAt: users.planSelectedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: updated });
  } catch (error: any) {
    console.error("Failed to update backend user:", error);
    return NextResponse.json({ error: `Failed to update user: ${error.message || String(error)}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return new NextResponse("Missing user id", { status: 400 });
    }

    await backendDb.delete(users).where(eq(users.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete backend user:", error);
    return NextResponse.json({ error: `Failed to delete user: ${error.message || String(error)}` }, { status: 500 });
  }
}
