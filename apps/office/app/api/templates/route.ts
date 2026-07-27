import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { auth } from "../../../auth";
import { db } from "../../../database";
import { documentTemplates } from "../../../database/schema";

// Copied from apps/backend/app/api/templates/route.ts (not shared -- see
// database/schema.ts's documentTemplates comment). Unlike apps/backend's
// version, every handler here checks the session itself: middleware.ts
// doesn't cover /api routes, and this data is admin-only, so it can't be
// left reachable by anyone who finds the URL the way apps/backend's is.

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get("lang") || "en";

    const templates = await db.select().from(documentTemplates).where(eq(documentTemplates.language, lang));

    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error("Failed to query templates:", error);
    return NextResponse.json({ error: `Failed to list templates: ${error.message || String(error)}` }, { status: 500 });
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
      return new NextResponse("Missing template id", { status: 400 });
    }

    const [template] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, id));

    if (template) {
      await del(template.url, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      await db.delete(documentTemplates).where(eq(documentTemplates.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete template:", error);
    return NextResponse.json({ error: `Failed to delete template: ${error.message || String(error)}` }, { status: 500 });
  }
}
