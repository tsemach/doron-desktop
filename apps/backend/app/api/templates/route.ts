import { NextResponse } from "next/server";
import { db } from "../../../database";
import { documentTemplates } from "../../../database/schema";
import { eq } from "drizzle-orm";

// GET (below) is a live dependency of apps/desktop (see
// DocsManagementTemplatesDownloadModal.tsx, which lists templates from
// here before downloading one) -- keep it. The admin upload/manage UI that
// used to live at apps/backend/app/templates/page.tsx (and its DELETE
// handler here) has moved to apps/office; this route no longer needs to
// support deleting.

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
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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
