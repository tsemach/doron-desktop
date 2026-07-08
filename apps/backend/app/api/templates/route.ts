import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

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
    
    // Prefix pointing to documents-templates/en/ or documents-templates/he/
    const prefix = `documents-templates/${lang}/`;
    
    // Retrieve list of blobs matching the prefix
    const result = await list({
      prefix,
    });
    
    // Map blobs to a clean payload format for the desktop client
    const templates = result.blobs
      .filter(blob => !blob.pathname.endsWith("/")) // Exclude empty folder markers if any
      .map(blob => {
        const fileName = blob.pathname.split("/").pop() || "template";
        return {
          url: blob.url,
          fileName,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
        };
      });
    
    const response = NextResponse.json({ templates });
    return setCorsHeaders(request, response);
  } catch (error: any) {
    const response = NextResponse.json(
      { error: `Failed to list templates: ${error.message || String(error)}` },
      { status: 500 }
    );
    return setCorsHeaders(request, response);
  }
}
