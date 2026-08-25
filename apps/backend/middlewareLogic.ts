import { NextResponse } from "next/server";
import { isFeatureEnabled } from "./lib/featureGating";

// Paths that require a session -- redirected to /login when isLoggedIn is
// false. Matches the pre-existing /checkout and /profile behavior, plus the
// new private workspace at /app.
const AUTH_REQUIRED_PREFIXES = ["/checkout", "/profile", "/app"];

// The site is a public portal by default (marketing/home, registration,
// downloads) -- login is only required for specific functions, not to
// browse the site. "/" is special-cased below: it's the session-aware
// entry point (redirect into /app when logged in, otherwise serve the
// marketing homepage that now lives at /home) rather than a page of its
// own, so a logged-in user never needs a nav link to find their workspace.
export function resolveMiddlewareResponse(nextUrl: URL, isLoggedIn: boolean): NextResponse {
  const { pathname } = nextUrl;

  if (pathname === "/") {
    return isLoggedIn && isFeatureEnabled("app")
      ? NextResponse.redirect(new URL(`/app${nextUrl.search}`, nextUrl))
      : NextResponse.rewrite(new URL(`/home${nextUrl.search}`, nextUrl));
  }

  const requiresAuth = AUTH_REQUIRED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
  if (requiresAuth && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (pathname.startsWith("/login") && isLoggedIn) {
    // Redirect already authenticated users straight into their workspace
    // (previously redirected to "/", which would now just bounce them to
    // /app anyway -- this skips the extra hop).
    return NextResponse.redirect(new URL("/app", nextUrl));
  }

  return NextResponse.next();
}
