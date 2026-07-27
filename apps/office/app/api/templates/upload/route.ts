import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "../../../../auth";
import { db } from "../../../../database";
import { documentTemplates } from "../../../../database/schema";

// Copied from apps/backend/app/api/templates/upload/route.ts -- see
// database/schema.ts's documentTemplates comment. Session-gated, unlike
// apps/backend's version (see route.ts's comment in the parent directory).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const language = formData.get("language") as string | null;

    if (!file || !title || !language) {
      return NextResponse.json(
        { error: "Missing required fields: file, title, and language must be provided." },
        { status: 400 }
      );
    }

    const uniqueFileName = `${crypto.randomUUID()}-${file.name}`;
    const blobPath = `documents-templates/${language}/${uniqueFileName}`;
    const blob = await put(blobPath, file, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const [inserted] = await db
      .insert(documentTemplates)
      .values({
        fileName: file.name,
        title: title,
        url: blob.url,
        language: language,
        fileSize: file.size,
      })
      .returning();

    return NextResponse.json({ success: true, template: inserted });
  } catch (error: any) {
    console.error("Failed to upload document template:", error);
    return NextResponse.json({ error: `Upload failed: ${error.message || String(error)}` }, { status: 500 });
  }
}
