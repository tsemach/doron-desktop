import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("session_token");

  // Protect /download path
  if (request.nextUrl.pathname.startsWith("/download")) {
    if (!session || session.value !== "mock-authenticated-session-jwt") {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Redirect logged-in users away from /login
  if (request.nextUrl.pathname.startsWith("/login")) {
    if (session && session.value === "mock-authenticated-session-jwt") {
      const downloadUrl = new URL("/download", request.url);
      return NextResponse.redirect(downloadUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/download/:path*", "/login"],
};
