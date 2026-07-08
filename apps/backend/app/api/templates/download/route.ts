import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { db } from "../../../../database";
import { documentTemplates } from "../../../../database/schema";
import { eq } from "drizzle-orm";

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
    const id = searchParams.get("id");
    if (!id) {
      const response = new NextResponse("Missing id parameter", { status: 400 });
      return setCorsHeaders(request, response);
    }

    // Look up template in Postgres by id
    const [template] = await db
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, id));

    if (!template) {
      const response = new NextResponse("Template file not found in registry", { status: 404 });
      return setCorsHeaders(request, response);
    }

    // Fetch private blob using Vercel Blob SDK using the database url
    const file = await get(template.url, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    if (!file) {
      const response = new NextResponse("Template file not found in storage", { status: 404 });
      return setCorsHeaders(request, response);
    }

    // Return the blob stream
    const response = new NextResponse(file.stream, {
      headers: {
        "Content-Type": file.blob.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${template.fileName}"`,
      },
    });
    return setCorsHeaders(request, response);
  } catch (error: any) {
    console.error("Failed to proxy private blob download:", error);
    const response = NextResponse.json(
      { error: `Failed to download template: ${error.message || String(error)}` },
      { status: 500 }
    );
    return setCorsHeaders(request, response);
  }
}
