import { NextResponse } from "next/server";
import { get } from "@vercel/blob";

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
    const url = searchParams.get("url");
    if (!url) {
      const response = new NextResponse("Missing url parameter", { status: 400 });
      return setCorsHeaders(request, response);
    }

    // Fetch private blob using Vercel Blob SDK
    const file = await get(url, {
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
        "Content-Disposition": `attachment; filename="${file.blob.pathname.split("/").pop()}"`,
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
