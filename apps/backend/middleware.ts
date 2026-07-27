import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { NextResponse } from "next/server";

// Initialize NextAuth with base config
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;

  const isLoginPage = nextUrl.pathname.startsWith("/login");

  // The site is a public portal by default (marketing/home, registration,
  // downloads) -- login is only required for specific functions, not to
  // browse the site. /checkout is the paid-plan flow; /profile is the
  // user's own account/subscription page. (The document-template admin
  // tool that used to live at /templates has moved to apps/office.)
  const requiresAuth =
    nextUrl.pathname.startsWith("/checkout") ||
    nextUrl.pathname.startsWith("/profile");

  if (requiresAuth && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (isLoginPage && isLoggedIn) {
    // Redirect already authenticated users to the root portal page
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Protect all routes except api, _next/static, _next/image, and favicon.ico
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
