# Private-area shell & entry point — design

**Linear issue:** [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend) — "Add user area in the backend"
**Status:** Sub-project 1 of 6 (see [ASC-105 decomposition](#asc-105-decomposition) below)
**Date:** 2026-08-10

## ASC-105 decomposition

ASC-105 describes a large architectural shift: moving primary business logic and UI
from the desktop-only Tauri app into a multi-tenant SaaS "user area" hosted in
`apps/backend`, with the desktop app becoming more of a local-machine-access GUI.
It is too large for a single spec, so it was broken into six independent
sub-projects, in rough dependency order:

1. **Private-area shell & entry point** — this document.
2. **Opening/dashboard page** — depends on #1 only, not on real data.
3. **Cases/documents data-ownership decision** (backend Postgres vs. desktop-local
   vs. hybrid) — the highest-leverage, most consequential decision; blocks real
   (non-mock) workspace features and all of sync.
4. **Offline + two-way sync** — cannot be designed until #3 is decided.
5. **Shared UI strategy** (`packages/ui` expansion) — can start early in parallel,
   but concrete data-bound components need #3 resolved.
6. **"Coming soon" gating for unbuilt features** — small, mechanical, depends on #1.

This document covers **#1 only**. #2–#6 each get their own spec later.

## Background

Two pieces of relevant groundwork already exist and shape this design:

- **Multi-tenant identity (ASC-142, merged)** — `firms`, `users` (with
  `role`: admin/manager/user/flat, `firmId`), `teams`, `teamMembers`,
  `invitations`, `flatGroups` already live in
  `packages/backend-orm/src/schema.ts`. `session.user.{role,firmId,tier}` is
  already populated by `auth.ts`'s `session` callback.
- **Public-by-default site** — `apps/backend/middleware.ts` already gates only
  `/checkout` and `/profile` behind login; everything else (marketing, docs,
  pricing) is open to anonymous visitors.

What does not exist yet: any private workspace IA/shell, and any dashboard/home
page for a logged-in user. `/profile` exists but is account/subscription
settings only, not a workspace.

## Goals

- A logged-in user who lands on the bare domain (`/`) is taken straight into
  their private workspace, with no marketing nav link required to get there.
- An anonymous visitor to `/` still sees the existing marketing homepage,
  unchanged, at the same canonical URL.
- From inside the private workspace, a user can get back to public marketing
  content (e.g. to check pricing) via the logo, without being immediately
  bounced back into the workspace.
- The shell establishes the pattern (auth check, session/firm access, header)
  that later sub-projects (#2 dashboard, #6 coming-soon gating) build on.

## Non-goals (explicitly deferred)

- Real dashboard/workspace content — #2.
- Any case/document data or features — #3.
- Role-based nav differences (admin vs. manager vs. user vs. flat) — the shell
  renders identically for all roles for now.
- Preserving intended destination through the login redirect (`callbackUrl`)
  — `/checkout` and `/profile` don't do this today either; not a regression
  introduced here, just an existing gap left alone.

## Design

### Routing (`apps/backend/middleware.ts`)

Three changes to the existing `auth()`-wrapped middleware:

1. New special case for the exact path `/`:
   - `isLoggedIn` → `NextResponse.redirect(new URL("/app", nextUrl))`.
   - else → `NextResponse.rewrite(new URL("/home", nextUrl))` — the address
     bar keeps showing `/`, so the canonical marketing URL and SEO are
     unaffected; only the internally-served content changes.
2. Add `/app` to the existing `requiresAuth` check, alongside `/checkout` and
   `/profile` (same redirect-to-`/login` behavior).
3. Change the existing `isLoginPage && isLoggedIn` branch to redirect to
   `/app` instead of `/` (today it sends them to `/`, which — after change
   1 — would just bounce them to `/app` anyway; redirecting directly there
   avoids the extra hop).

### File moves / new routes

- Move `apps/backend/app/page.tsx` (today's marketing homepage, and any
  components it exclusively owns) to `apps/backend/app/home/page.tsx`,
  content unchanged. `/home` is never linked from public nav — it exists
  only as the internal rewrite target and the in-app "back to public site"
  link destination.
- New `apps/backend/app/app/layout.tsx` — the private shell:
  - Calls `auth()` (same helper already used in
    `app/api/v1/auth/profile/route.ts`); if no session, redirect to
    `/login` (defense in depth — middleware already gates this).
  - Renders `AppTopBar` (see below) + a content slot for nested pages.
  - If `session.user.firmId` is set, queries `firms.name` for display
    (small inline query, same pattern as `profile/route.ts` — no new
    service layer). If `firmId` is null (the `flat` role), falls back to a
    generic "Personal workspace" label instead of a firm name.
- New `apps/backend/app/app/page.tsx` — minimal placeholder content
  ("Welcome back" + firm name/fallback). This is intentionally thin; #2
  replaces it with the real dashboard.

### Component reuse

- `components/main/MainTopBarLogo.tsx` currently hardcodes `href="/"`. Add
  an optional `href` prop, defaulting to `"/"` (marketing header behavior
  unchanged) — a one-line, backward-compatible extension.
- New `components/app/AppTopBar.tsx` composes `MainTopBarLogo` (passing
  `href="/home"`) and the existing `MainTopBarUser` (already generic:
  `userName`/`tier`/`handleLogout` props, no marketing-specific
  assumptions). It does **not** reuse `MainTopBar.tsx` wholesale, since that
  component's nav (`NAV_LINKS`: Products/Download/Pricing) is
  marketing-specific; `AppTopBar` gets its own (currently empty/minimal)
  nav area for future workspace links.

### Data

No new tables. Everything needed (`role`, `firmId`, `tier`) is already on
`session.user` via `auth.ts`'s existing `session` callback (ASC-142). The
only new query is the optional firm-name lookup in `app/app/layout.tsx`
described above.

## Edge cases

- **`flat` role (no firm)** — shell must render without a firm name; falls
  back to "Personal workspace" rather than erroring or showing "undefined".
- **Direct deep link to `/app/...` while logged out** — handled by the
  existing `requiresAuth` middleware pattern (redirect to `/login`), same as
  `/checkout`/`/profile` today.
- **Direct navigation to `/home` while logged in** — allowed; it's a normal
  public page, not gated. This is deliberate: it's how the in-app logo link
  avoids the `/`-redirect loop.
- **Stale JWT-cached `role`/`firmId`/`tier` in middleware** — middleware's
  edge-runtime `auth` instance only reads `isLoggedIn`, never
  `role`/`firmId`/`tier` (per the existing comment in `auth.ts`), so this
  design doesn't introduce any new staleness exposure at the middleware
  layer. `app/app/layout.tsx` runs in the full Node runtime and gets the
  freshly-refetched session values.

## Testing

- Middleware behavior: `/` logged out → serves `/home` content, URL stays
  `/`; `/` logged in → redirects to `/app`; `/app` logged out → redirects to
  `/login`; `/login` while logged in → redirects to `/app`.
- Manual: click the logo from inside `/app` → lands on `/home` content
  without bouncing back to `/app`.
- Manual: a `flat`-role account (no `firmId`) sees the "Personal workspace"
  fallback instead of an error or blank firm name.

## What this unblocks

Once this shell exists, sub-project #2 (opening/dashboard page) replaces the
placeholder `app/app/page.tsx` content, and sub-project #6 (coming-soon
gating) hangs "not built yet" states off the same shell/nav. #3
(cases/documents data-ownership), #4 (offline/sync), and #5 (shared UI
strategy) remain independent tracks not blocked by this sub-project.
