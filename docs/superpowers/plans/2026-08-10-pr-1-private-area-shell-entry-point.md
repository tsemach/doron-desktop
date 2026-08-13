# Private-area shell & entry point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a logged-in user an automatic entry point into a new `/app` private workspace shell, while anonymous visitors still see today's marketing homepage at `/`, and provide a loop-free way back to public content from inside the shell.

**Architecture:** `apps/backend/middleware.ts` gains a session-aware split on the `/` path (redirect logged-in users to `/app`, rewrite anonymous users to an internal `/home` route that now holds the marketing homepage). A new `apps/backend/app/app/` route tree hosts the private shell (`layout.tsx`, gated by `auth()`) and a placeholder landing page (`page.tsx`). `MainTopBarLogo` gains an optional `href` so a new `AppTopBar` can point it at `/home` instead of `/`.

**Tech Stack:** Next.js 15 App Router, NextAuth v5 (`auth()`, JWT session), Drizzle ORM (`@workspace/backend-orm` via `apps/backend/database`), Vitest for unit tests, Tailwind v4 for styling (existing utility classes, no new design tokens).

## Global Constraints

- Reuse existing patterns exactly: `auth()` import path (`../../auth` style, matching `app/api/v1/auth/profile/route.ts`), inline Drizzle queries (no new service layer), and the existing `NAV_LINKS`/`MainTopBar` composition style for the new `AppTopBar`.
- No new database tables or columns — `session.user.{role,firmId,tier}` already exists (ASC-142).
- No `@/` alias imports inside anything Vitest needs to load directly (`middleware.ts`, `middlewareLogic.ts`) — `vitest.config.ts` has no path-alias resolution configured, and the codebase's existing testable modules (`lib/*.ts`, `app/api/**/route.ts`) consistently use relative imports for this reason. `@/components/*` imports are fine in React component/page/layout files, which are never imported by a `.test.ts` file in this repo.
- Match existing component conventions: `"use client"` only on the module that owns interactivity/hooks (see `MainTopBar.tsx`); server components (layouts/pages doing `auth()`/DB calls) stay server components, matching `app/profile/page.tsx`'s API-route split and `app/layout.tsx`'s server `RootLayout`.

---

### Task 1: Testable middleware routing logic

**Files:**
- Create: `apps/backend/middlewareLogic.ts`
- Create: `apps/backend/middlewareLogic.test.ts`
- Modify: `apps/backend/middleware.ts` (full file, currently 33 lines)

**Interfaces:**
- Produces: `resolveMiddlewareResponse(nextUrl: URL, isLoggedIn: boolean): NextResponse` — pure routing-decision function, exported from `apps/backend/middlewareLogic.ts`. `middleware.ts`'s default export calls it with `(req.nextUrl, !!req.auth)`.

`middleware.ts` currently inlines its redirect logic directly inside the `auth((req) => {...})` callback, which makes it untestable without mocking NextAuth's edge runtime. This task extracts the pure decision logic (given a URL and a login flag, what response to return) into its own module, so it can be unit-tested directly — the callback in `middleware.ts` becomes a one-line delegator.

- [ ] **Step 1: Write the failing test file**

Create `apps/backend/middlewareLogic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveMiddlewareResponse } from "./middlewareLogic";

function url(pathname: string) {
  return new URL(pathname, "http://localhost:3000");
}

describe("resolveMiddlewareResponse", () => {
  it('rewrites "/" to /home for a logged-out visitor, keeping the URL bar at "/"', () => {
    const res = resolveMiddlewareResponse(url("/"), false);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/home");
  });

  it('redirects "/" to /app for a logged-in visitor', () => {
    const res = resolveMiddlewareResponse(url("/"), true);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("redirects /app to /login when logged out", () => {
    const res = resolveMiddlewareResponse(url("/app"), false);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets a logged-in visitor through to /app", () => {
    const res = resolveMiddlewareResponse(url("/app"), true);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects /login to /app when already logged in", () => {
    const res = resolveMiddlewareResponse(url("/login"), true);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("lets a logged-out visitor through to /login", () => {
    const res = resolveMiddlewareResponse(url("/login"), false);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("still redirects /checkout to /login when logged out (existing behavior)", () => {
    const res = resolveMiddlewareResponse(url("/checkout"), false);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("still redirects /profile to /login when logged out (existing behavior)", () => {
    const res = resolveMiddlewareResponse(url("/profile"), false);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets a logged-out visitor through to public pages like /pricing", () => {
    const res = resolveMiddlewareResponse(url("/pricing"), false);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a logged-in visitor through to /home directly (the in-app logo target)", () => {
    const res = resolveMiddlewareResponse(url("/home"), true);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter backend test middlewareLogic.test.ts`
Expected: FAIL — `Cannot find module './middlewareLogic'` (or similar resolution error), since the module doesn't exist yet.

- [ ] **Step 3: Implement `middlewareLogic.ts`**

Create `apps/backend/middlewareLogic.ts`:

```ts
import { NextResponse } from "next/server";

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
    return isLoggedIn
      ? NextResponse.redirect(new URL("/app", nextUrl))
      : NextResponse.rewrite(new URL("/home", nextUrl));
  }

  const requiresAuth = AUTH_REQUIRED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter backend test middlewareLogic.test.ts`
Expected: PASS — all 10 cases green.

- [ ] **Step 5: Wire `middleware.ts` to delegate to the new module**

Replace the full contents of `apps/backend/middleware.ts`:

```ts
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
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/middleware.ts apps/backend/middlewareLogic.ts apps/backend/middlewareLogic.test.ts
git commit -m "Extract testable middleware routing logic, add / entry-point split"
```

---

### Task 2: Move the marketing homepage to `/home`

**Files:**
- Move: `apps/backend/app/page.tsx` → `apps/backend/app/home/page.tsx` (content unchanged)

**Interfaces:**
- Consumes: nothing new. `HeroSection` and `CtaBanner` are imported via the `@/components/marketing/*` alias, which is location-independent, so moving the page file doesn't require touching those imports.
- Produces: a working page at the internal route `/home`, which Task 1's middleware rewrites anonymous `/` traffic to, and which Task 3's `AppTopBar` logo will link to.

After Task 1, no request ever reaches a page component at literal path `/` (middleware always redirects or rewrites it), so `app/page.tsx` becomes dead code left in place — it must move, not just get a sibling.

- [ ] **Step 1: Move the file**

```bash
mkdir -p apps/backend/app/home
git mv apps/backend/app/page.tsx apps/backend/app/home/page.tsx
```

- [ ] **Step 2: Verify the app still builds**

Run: `pnpm --filter backend build`
Expected: build succeeds; no missing-module errors for `HeroSection`/`CtaBanner` (they resolve via the `@/components/marketing/*` alias regardless of which page imports them).

- [ ] **Step 3: Manual check**

Start the dev server (assume already running per project convention, or `pnpm --filter backend dev` if not) and confirm:
- Visiting `http://localhost:3000/` while logged out renders the homepage content (hero, feature grid, CTA) — served via the Task 1 rewrite, URL bar still shows `/`.
- Visiting `http://localhost:3000/home` directly also renders the same content (this is the route that now actually owns the page).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/home/page.tsx
git commit -m "Move marketing homepage to /home, freeing / for session-based routing"
```

Note: `git mv` above already stages the deletion of the old path; this commit records the rename as a move (not a delete+add) as long as both steps run in the same commit.

---

### Task 3: Private-area top bar (`AppTopBar`)

**Files:**
- Modify: `apps/backend/components/main/MainTopBarLogo.tsx` (full file, currently 15 lines)
- Create: `apps/backend/components/app/AppTopBar.tsx`

**Interfaces:**
- Produces: `MainTopBarLogo({ href?: string })` (default `"/"`, backward compatible with its existing caller in `MainTopBar.tsx`, which renders `<MainTopBarLogo />` with no props).
- Produces: `AppTopBar({ userName: string | null; tier?: string | null })`, default export from `apps/backend/components/app/AppTopBar.tsx`. Consumed by Task 4's `app/app/layout.tsx`.
- Consumes: `MainTopBarUser` (existing, unchanged — `apps/backend/components/main/MainTopBarUser.tsx`, already takes `userName`/`tier`/`handleLogout` props).

- [ ] **Step 1: Add the `href` prop to `MainTopBarLogo`**

Replace the full contents of `apps/backend/components/main/MainTopBarLogo.tsx`:

```tsx
import Link from "next/link"

type MainTopBarLogoProps = {
  href?: string;
};

export default function MainTopBarLogo({ href = "/" }: MainTopBarLogoProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 text-sm font-bold text-foreground hover:opacity-80 transition-opacity"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
        A
      </span>
      <span>Ascurix</span>
    </Link>
  )
}
```

- [ ] **Step 2: Create `AppTopBar`**

Create `apps/backend/components/app/AppTopBar.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";
import MainTopBarLogo from "@/components/main/MainTopBarLogo";
import MainTopBarUser from "@/components/main/MainTopBarUser";

type AppTopBarProps = {
  userName: string | null;
  tier?: string | null;
};

export default function AppTopBar({ userName, tier }: AppTopBarProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <MainTopBarLogo href="/home" />
      <MainTopBarUser userName={userName} tier={tier} handleLogout={handleLogout} />
    </header>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors. (`AppTopBar` isn't imported anywhere yet, so this only validates the file in isolation plus `MainTopBarLogo`'s existing caller in `MainTopBar.tsx` still type-checks with the new optional prop.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/main/MainTopBarLogo.tsx apps/backend/components/app/AppTopBar.tsx
git commit -m "Add optional href to MainTopBarLogo, add AppTopBar for the private shell"
```

---

### Task 4: Private-area shell layout

**Files:**
- Create: `apps/backend/app/app/layout.tsx`

**Interfaces:**
- Consumes: `auth()` from `apps/backend/auth.ts` (session shape: `session.user.{id, name, email, tier, role, firmId}`, per the existing `session` callback in `auth.ts`). `AppTopBar` from Task 3 (`{ userName, tier }` props).
- Produces: the layout wrapping every route under `apps/backend/app/app/**`, including Task 5's `page.tsx`.

This is a server component (no `"use client"`, matching `app/layout.tsx`'s `RootLayout` convention) — it does the auth check and passes plain data down to the client-boundary `AppTopBar`. Auth is already enforced by Task 1's middleware for any `/app` path, but the layout redirects too as defense in depth (matching how gated routes are handled elsewhere; a direct server-side render should never trust middleware alone).

- [ ] **Step 1: Create the layout**

Create `apps/backend/app/app/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import AppTopBar from "@/components/app/AppTopBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userName = session.user.name || session.user.email || null;
  const tier = (session.user as { tier?: string }).tier ?? "free";

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <AppTopBar userName={userName} tier={tier} />
      <main className="flex-grow w-full">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manual check**

With the dev server running:
- Log out, visit `http://localhost:3000/app` directly — expect a redirect to `/login` (from Task 1's middleware; this also exercises the layout's own `redirect("/login")` if middleware is ever bypassed).
- Log in (a fresh signup works — self-registered accounts default to `role: "flat"`, `firmId: null`, matching the schema comment in `packages/backend-orm/src/schema.ts`), then visit `http://localhost:3000/` — expect an automatic redirect to `/app`, with the shell header showing your name/tier and a working user-menu dropdown (reused from `MainTopBarUser`, unchanged behavior).
- Click the Ascurix logo in the `/app` header — expect it to land on `/home` (the marketing homepage) without bouncing back to `/app`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/app/layout.tsx
git commit -m "Add private-area shell layout at /app"
```

---

### Task 5: Private-area placeholder page

**Files:**
- Create: `apps/backend/app/app/page.tsx`

**Interfaces:**
- Consumes: `auth()` from `apps/backend/auth.ts`; `db` from `apps/backend/database` (`../../database`); `firms` from `apps/backend/database/schema` (`../../database/schema`, re-exported from `@workspace/backend-orm`); `eq` from `drizzle-orm`.
- Produces: the `/app` route's page content, rendered inside Task 4's layout. This is intentionally minimal — sub-project #2 (opening/dashboard page) replaces this file's body; the shell and gating around it are what this plan delivers.

The firm-name lookup lives here (not in the layout) because this is the only place it's actually displayed — keeping it here avoids a duplicate query for data the header doesn't need.

- [ ] **Step 1: Create the page**

Create `apps/backend/app/app/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";

export default async function AppHomePage() {
  const session = await auth();
  const firmId = (session?.user as { firmId?: string | null } | undefined)?.firmId ?? null;

  // Self-registered ("flat") users have no firm (see packages/backend-orm's
  // schema comment on users.firmId) -- fall back to a generic label instead
  // of showing a blank/undefined firm name.
  let workspaceLabel = "Personal workspace";
  if (firmId) {
    const [firm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, firmId)).limit(1);
    if (firm?.name) {
      workspaceLabel = firm.name;
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="text-sm text-slate-500 mt-2">{workspaceLabel}</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manual check — flat-role fallback**

Log in as a self-registered (flat, no-firm) account and visit `/app` — expect "Welcome back" / "Personal workspace".

- [ ] **Step 4: Manual check — firm name**

For a user with a `firmId` (created via the existing `accept-invite` flow, or by setting `firm_id` directly on a test user's row in the local DB), visit `/app` — expect "Welcome back" / the firm's actual name instead of the fallback.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/app/page.tsx
git commit -m "Add private-area placeholder page with firm-aware welcome message"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

Runs the full spec test plan end-to-end now that all pieces exist together.

- [ ] **Step 1: Run the full backend test suite**

Run: `pnpm --filter backend test`
Expected: all tests pass, including the 10 new `middlewareLogic.test.ts` cases and every pre-existing test (no regressions in `lib/*.test.ts`, `app/api/**/route.test.ts`).

- [ ] **Step 2: Full build**

Run: `pnpm --filter backend build`
Expected: succeeds with no new warnings about the moved/added routes.

- [ ] **Step 3: Manual walkthrough**

With the dev server running, in order:
1. Logged out, visit `/` — see the marketing homepage, URL stays `/`.
2. Log in — land automatically on `/app` (no link click needed).
3. On `/app`, click the Ascurix logo — land on `/home`, marketing content, no bounce back to `/app`.
4. Navigate back to `/` manually (address bar) while still logged in — redirected straight back to `/app`.
5. Visit `/pricing` while logged in — loads normally, no redirect (public pages stay reachable).
6. Log out, visit `/app` directly — redirected to `/login`.
7. Log in again — redirected to `/app` directly (not `/`), per the updated `isLoginPage && isLoggedIn` branch.

- [ ] **Step 4: Commit (if any fixups were needed)**

Only if Step 3 surfaced an issue requiring a code change — otherwise this task produces no commit of its own; it's a verification gate on the five commits already made.

## Spec coverage check

- Redirect/rewrite split on `/` — Task 1.
- `/app` added to `requiresAuth` — Task 1.
- `isLoginPage && isLoggedIn` → `/app` — Task 1.
- Marketing homepage moved to `/home` — Task 2.
- `AppTopBar` composing `MainTopBarLogo` (href override) + `MainTopBarUser` — Task 3.
- `app/app/layout.tsx` shell with `auth()` gate — Task 4.
- `app/app/page.tsx` placeholder with firm-name/flat-fallback — Task 5.
- Edge cases from the spec (flat-role fallback, deep-link-while-logged-out, `/home` reachable while logged in, all four middleware redirect/rewrite scenarios) — covered across Task 1's unit tests and Tasks 4–6's manual checks.
