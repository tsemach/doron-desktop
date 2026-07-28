import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "../../../database";
import { adminUsers } from "../../../database/schema";

// CRUD over office's own admin_users table (Ascurix staff/ops accounts),
// same pattern as app/api/users/route.ts but against office's own `db`
// instead of backendDb. Session-gated like the other /api routes here,
// since middleware.ts doesn't cover /api.

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        id: adminUsers.id,
        name: adminUsers.name,
        email: adminUsers.email,
        createdAt: adminUsers.createdAt,
        updatedAt: adminUsers.updatedAt,
      })
      .from(adminUsers)
      .orderBy(desc(adminUsers.createdAt));

    return NextResponse.json({ admins: rows });
  } catch (error: any) {
    console.error("Failed to query admins:", error);
    return NextResponse.json({ error: `Failed to list admins: ${error.message || String(error)}` }, { status: 500 });
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
      return new NextResponse("Missing admin id", { status: 400 });
    }

    const { name, email } = await request.json();
    if (!name && !email) {
      return new NextResponse("No editable fields provided", { status: 400 });
    }

    const [updated] = await db
      .update(adminUsers)
      .set({ ...(name && { name }), ...(email && { email }), updatedAt: new Date() })
      .where(eq(adminUsers.id, id))
      .returning({
        id: adminUsers.id,
        name: adminUsers.name,
        email: adminUsers.email,
        createdAt: adminUsers.createdAt,
        updatedAt: adminUsers.updatedAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    return NextResponse.json({ admin: updated });
  } catch (error: any) {
    console.error("Failed to update admin:", error);
    return NextResponse.json({ error: `Failed to update admin: ${error.message || String(error)}` }, { status: 500 });
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
      return new NextResponse("Missing admin id", { status: 400 });
    }

    // Without this, an admin could delete their own account mid-session and
    // get locked out with no one left to undo it (no public self-service
    // signup -- see database/schema.ts's adminUsers comment).
    if (id === session.user.id) {
      return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
    }

    await db.delete(adminUsers).where(eq(adminUsers.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete admin:", error);
    return NextResponse.json({ error: `Failed to delete admin: ${error.message || String(error)}` }, { status: 500 });
  }
}
