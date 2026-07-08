import { NextResponse } from "next/server";
import { db } from "../../../database";
import { documentTemplates } from "../../../database/schema";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";

const ALLOWED_ORIGINS = [
  "http://localhost:1420",
  "tauri://localhost",
  "http://tauri.localhost",
];

function setCorsHeaders(request: Request, response: NextResponse) {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export async function OPTIONS(request: Request) {
  const response = new NextResponse(null, { status: 204 });
  return setCorsHeaders(request, response);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get("lang") || "en";

    // Query templates from database matching language
    const templates = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.language, lang));

    const response = NextResponse.json({ templates });
    return setCorsHeaders(request, response);
  } catch (error: any) {
    console.error("Failed to query templates:", error);
    const response = NextResponse.json(
      { error: `Failed to list templates: ${error.message || String(error)}` },
      { status: 500 }
    );
    return setCorsHeaders(request, response);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      const response = new NextResponse("Missing template id", { status: 400 });
      return setCorsHeaders(request, response);
    }

    // Look up template in database to get the Vercel Blob URL
    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id));

    if (template) {
      // 1. Delete from Vercel Blob store
      await del(template.url, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      // 2. Delete from Postgres database registry
      await db.delete(documentTemplates).where(eq(documentTemplates.id, id));
    }

    const response = NextResponse.json({ success: true });
    return setCorsHeaders(request, response);
  } catch (error: any) {
    console.error("Failed to delete template:", error);
    const response = NextResponse.json(
      { error: `Failed to delete template: ${error.message || String(error)}` },
      { status: 500 }
    );
    return setCorsHeaders(request, response);
  }
}
