import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { resolveMiddlewareResponse } from "./middlewareLogic";

// Initialize NextAuth with base config
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  return resolveMiddlewareResponse(req.nextUrl, !!req.auth);
});

export const config = {
  // Protect all routes except api, _next/static, _next/image, and favicon.ico
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
