import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import path from "path";
import fs from "fs";

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session_token");

  if (!session || session.value !== "mock-authenticated-session-jwt") {
    return new NextResponse("Unauthorized. Please log in first.", { status: 401 });
  }

  // Path to the Tauri build output bundles
  const targetDir = path.join(
    process.cwd(),
    "../desktop/src-tauri/target/release/bundle/msi"
  );

  try {
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      const installerFile = files.find(
        (f) => f.endsWith(".msi") || f.endsWith(".exe")
      );

      if (installerFile) {
        const filePath = path.join(targetDir, installerFile);
        const fileBuffer = fs.readFileSync(filePath);

        return new NextResponse(fileBuffer, {
          headers: {
            "Content-Disposition": `attachment; filename="${installerFile}"`,
            "Content-Type": "application/octet-stream",
          },
        });
      }
    }

    // Fallback response for development (if Tauri is not yet compiled)
    return new NextResponse(
      "Installer build not found. Please compile the Tauri desktop application first using: 'pnpm --filter desktop build'.",
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read installer payload" },
      { status: 500 }
    );
  }
}
