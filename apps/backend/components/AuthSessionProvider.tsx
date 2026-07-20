"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

// Thin client wrapper so client components (register/plan page, login page)
// can use next-auth/react's useSession() instead of each hand-rolling their
// own "am I signed in" check against the session cookie.
export default function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
