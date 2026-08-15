# Opening/dashboard page — revision round design

**Linear issue:** [ASC-150](https://linear.app/amicusx/issue/ASC-150/openingdashboard-page) — "Opening/dashboard page" (sub-project 2 of [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend))
**Status:** Revision round on top of the merged-in-spirit v1 (PR [#159](https://github.com/tsemach/doron-desktop/pull/159), branch `tsemachmizrachi/asc-105-add-user-area-in-the-backend-pr-2`)
**Date:** 2026-08-12

## Background

PR #159 shipped a first version of the `/app` dashboard: `AppTopBar` (logo + user menu, no nav), a "Welcome back" + workspace-label greeting, a two-column grid (Recent Cases list + 2×2 stat tiles on the left, a static Notifications card on the right). This document covers a round of revisions requested against that shipped version, based on a hand-drawn/reference-image walkthrough. It supersedes the relevant parts of `2026-08-12-opening-dashboard-page-design.md` (the original spec) rather than replacing it wholesale — that document's Non-goals (no real data, no case actions) and overall mocked-data approach still hold.

## Goals

1. Add a persistent nav menu (Cases/Tasks/Calendar/Billing/Documents) to the `/app` topbar, sharing a base component with the marketing topbar rather than duplicating the shell.
2. Move the firm/workspace name out of the "Welcome back" greeting and into the user-menu area; change the greeting itself to "Welcome `<full name>`".
3. Change the stat tiles from a 2×2 grid to a single row of 4, positioned below the new nav menu.
4. Remove the page's horizontal centering so content hugs the left edge, using the width freed by removing the right-hand notifications column.
5. Rebuild "Recent Cases" as "Open cases": three independent, collapsible groups (Recent cases / Follow up / Email arrived) instead of one flat list.
6. Replace the static right-column Notifications card with a floating bottom-right bell + unread badge that opens a color-coded dropup list.

## Non-goals (explicitly deferred)

- The five new nav routes (`/app/cases`, `/app/tasks`, `/app/calendar`, `/app/billing`, `/app/documents`) are placeholder "coming soon" pages only — no real feature content. Building out any of those features is out of scope here and belongs to later ASC-105 sub-projects (per the roadmap, #3 for cases/documents data, and a future dedicated nav/gating pass).
- No change to `/home`, `/login`, `/register`, or any other marketing page's *content* — only `MainTopBar.tsx`'s internal structure changes (extracted to share `TopBarShell`), with no visible/behavioral difference on those pages.
- Real data for `dueDate`/`hasPendingEmail` — both are new mock-only fields; sub-project #3 (cases/documents data-ownership) still governs when/how real values replace them.
- Notification read/unread state persistence, marking as read, or any backend-backed unread count — the badge count is just `mockNotifications.length` for now (all mock notifications are treated as "unread").

## Design

### 1. Shared topbar base (`TopBarShell`)

New `apps/backend/components/main/TopBarShell.tsx` (co-located with `MainTopBarLogo`/`MainTopBarUser`, which both `MainTopBar` and `AppTopBar` already import from `components/main/` — the established "shared across marketing and app-shell" location):

```ts
type TopBarShellProps = {
  logoHref: string;
  nav: React.ReactNode;
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
  handleLogout: () => void;
};
```

Renders the `<header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">` wrapper (today duplicated verbatim in both `MainTopBar.tsx` and `AppTopBar.tsx`), with `<div className="flex items-center gap-8"><MainTopBarLogo href={logoHref} />{nav}</div>` on the left and `<MainTopBarUser userName={userName} tier={tier} workspaceLabel={workspaceLabel} handleLogout={handleLogout} />` on the right.

- `MainTopBar.tsx` shrinks to building its existing `NAV_LINKS`-mapped `<nav>` (unchanged markup/behavior) and its `MainTopBarResourcesDropdown`, passed as the `nav` prop. Visually and behaviorally identical to today for every marketing page.
- `AppTopBar.tsx` shrinks to building the new `AppNavMenu` (below) as its `nav` prop, and passing through the new `workspaceLabel` prop it now receives.

### 2. `AppNavMenu` — dashboard pill nav

New `apps/backend/components/app/AppNavMenu.tsx`, `"use client"` (needs `usePathname()` for active-segment highlighting). Visual structure ported class-for-class from `apps/desktop/src/components/DocsManagement/DocsManagementHeader.tsx:73-156`'s segmented toolbar — that component already uses the same CSS-variable tokens as `apps/backend` (`bg-muted`, `border-border`, `bg-background`, `text-foreground`, `text-muted-foreground`), so this is a direct style port, not new design:

- Track: `<nav className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/40">`
- Each segment: a `<Link>` styled `px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5`, active (path match) → `bg-background text-foreground shadow-sm font-bold`, inactive → `text-muted-foreground hover:text-foreground`.
- Five segments, each with a `lucide-react` icon: Cases (`Briefcase`, `/app/cases`), Tasks (`ListChecks`, `/app/tasks`), Calendar (`CalendarClock`, `/app/calendar`), Billing (`CreditCard`, `/app/billing`), Documents (`FileText`, `/app/documents`).
- Hidden below `md` (`hidden md:flex`) — five labeled segments plus the logo and user menu don't fit a narrow topbar; this is supplementary nav, not the only way to reach these pages once they exist for real.

### 3. Five "coming soon" routes

One shared `apps/backend/components/app/ComingSoon.tsx` (`{ feature: string }` prop, centered card: icon + "`{feature}` is coming soon" + a short static sentence), rendered by five near-identical one-line pages: `apps/backend/app/app/{cases,tasks,calendar,billing,documents}/page.tsx`. Each is nested under `apps/backend/app/app/`, so it's automatically wrapped by the existing `layout.tsx` shell (auth gate, topbar, and the new notification bell from §6) with zero additional wiring.

### 4. Greeting and workspace-label relocation

- The firm-name lookup (currently in `page.tsx`: `firmId` from session → `db.select(...).from(firms)...` → `workspaceLabel`) moves to `layout.tsx`, since that's what now needs it (via `AppTopBar` → `TopBarShell` → `MainTopBarUser`). `page.tsx` no longer imports `db`/`firms`/`eq`.
- `MainTopBarUser.tsx` gains an optional `workspaceLabel?: string | null` prop. When present, renders as a second, smaller line under the name/tier line:
  ```tsx
  <div className="flex flex-col leading-tight select-none">
    <span className="text-sm font-semibold text-foreground">{userName} <span className="text-muted-foreground">({tierLabel})</span></span>
    {workspaceLabel && <span className="text-xs text-muted-foreground">{workspaceLabel}</span>}
  </div>
  ```
  Every other caller of `MainTopBarUser` (marketing pages, via `MainTopBar`) simply never passes `workspaceLabel`, so nothing changes there — same optional-prop, backward-compatible pattern as `MainTopBarLogo`'s `href` from sub-project 1.
- `page.tsx` keeps its own `auth()` call (independent of `layout.tsx`'s) solely to read `session.user.name` (falling back to `session.user.email`, matching `layout.tsx`'s existing `userName` derivation) for the greeting. This is a second `auth()` call per render, same as the already-accepted, parked non-blocking note from sub-project 1 ("`auth()` is called twice per `/app` render with no request-level caching") — not a new problem, just the same one recurring in a second file.
- Greeting changes from `<h1>Welcome back</h1>` + a workspace-label `<p>` to a single `<h1>Welcome {userName}</h1>` (no separate label line).

### 5. Stat tiles: single row, page: left-aligned full width

- `StatTilesGrid.tsx`: `grid grid-cols-2 gap-4` → `grid grid-cols-4 gap-4`. No prop/type changes.
- `page.tsx`'s root container: `max-w-6xl mx-auto px-6 py-10` → `px-6 py-10` (drop both the `max-w-6xl` cap and the `mx-auto` centering — full available width, content naturally left-anchored since there's no longer a competing right column).
- New page body order: stat-tiles row, then the Open Cases panel (§6) below it — both full width, single column. (The prior two-column `grid grid-cols-1 lg:grid-cols-3` wrapper is removed entirely, since Notifications no longer occupies a column — see §7.)

### 6. Open Cases: three collapsible groups

Data model addition (`lib/dashboard/types.ts`):

```ts
export interface CaseSummary {
  id: string;
  subject: string;
  client: string;
  status: CaseStatus;
  updatedAt: string;
  dueDate?: string;          // ISO date; Follow up group = dueDate in the past
  hasPendingEmail?: boolean; // Email arrived group = true
}
```

A case can appear in more than one group (per explicit decision) — the three groups are independent filtered views over the same `cases` array, not a partition:
- **Recent cases** — unchanged existing logic: sort by `updatedAt` descending, take 5.
- **Follow up** — `cases.filter(c => c.dueDate && new Date(c.dueDate) < new Date())`.
- **Email arrived** — `cases.filter(c => c.hasPendingEmail)`.

Component split (all under `apps/backend/components/app/dashboard/`):

- **`CaseRow.tsx`** — the existing per-case row markup extracted verbatim from today's `RecentCasesList.tsx` (icon square, subject/client, status pill + `formatDashboardDate(c.updatedAt)`), taking `{ case: CaseSummary }`.
- **`CaseGroup.tsx`** — `"use client"`, `{ title: string; cases: CaseSummary[] }`. Renders a header button (`ChevronRight`/`ChevronDown` icon on the left — swapped, not rotated, per the explicit ask — + `title` + a muted count badge) that toggles local `expanded` state. Body: a `<ul>` of up to 3 `CaseRow`s when collapsed (or all of them when `cases.length <= 3`, in which case the header renders without a chevron/toggle at all — nothing to expand). When collapsed and `cases.length > 3`: wraps the list in a fixed-height, `overflow-hidden` container with `transition-[max-height] duration-300 ease-in-out`, plus an absolutely-positioned `bg-gradient-to-t from-card to-transparent` overlay on the bottom ~2.5rem to visually fade the cut-off list. Expanding animates `max-height` to the full content height (measured via a ref, or simply a generously large `max-h-[2000px]` — content here is always small) and fades the overlay out (`transition-opacity`).
- **`OpenCasesPanel.tsx`** — replaces `RecentCasesList.tsx` as `page.tsx`'s import. One bordered card (same `rounded-xl border border-border bg-card shadow-xs` container as today), heading "Open cases", containing three `CaseGroup`s in order: Recent cases, Follow up, Email arrived. Computes the three filtered/sorted arrays from the single `cases: CaseSummary[]` prop it receives.

Mock data (`mockData.ts`) grows from 6 to 9 `CaseSummary` entries so **every** group — not just Recent — has more than 3 items and genuinely exercises the collapse/fade behavior:

| id | dueDate (past → Follow up) | hasPendingEmail (→ Email arrived) |
|---|---|---|
| case-2 | 2026-08-05 | — |
| case-4 | 2026-08-01 | — |
| case-6 | 2026-07-25 | — |
| case-7 (new) | 2026-08-03 | — |
| case-9 (new) | 2026-07-30 | true |
| case-1 | — | true |
| case-3 | — | true |
| case-5 | — | true |
| case-8 (new) | — | true |

Follow up = {case-2, case-4, case-6, case-7, case-9} (5). Email arrived = {case-1, case-3, case-5, case-8, case-9} (5), with case-9 deliberately in both groups to exercise the "can appear in multiple groups" behavior. Recent cases (top 5 by `updatedAt`) is unaffected by the 3 new entries, since case-7/8/9 all get `updatedAt` older than the existing top 5.

### 7. Notifications: bottom-right dropup

- New `apps/backend/components/app/dashboard/NotificationBell.tsx`, `"use client"`, `{ notifications: NotificationItem[] }`. Fixed at `bottom-6 right-6 z-50`: a circular button (`Bell` icon) with a small badge (`bg-destructive text-destructive-foreground`, count = `notifications.length`) shown only when count > 0. Reuses the exact click-outside-to-close pattern already in `MainTopBarUser.tsx` (a `ref` + `mousedown` document listener) rather than introducing a new one.
- Clicking toggles a panel opening **upward**: `absolute bottom-full right-0 mb-3`, same card chrome as the rest of the dashboard (`bg-card border border-border rounded-xl shadow-lg`), containing the existing `NotificationsPanel` reused as-is for the list body (no duplicated list-rendering logic) — just with its per-item icon background recolored by type instead of today's flat `bg-muted`:
  - `email` → `bg-blue-100 text-blue-600`
  - `document` → `bg-purple-100 text-purple-600`
  - `case` → `bg-emerald-100 text-emerald-700` (ties visually to the dashboard's "open" status green)
  - `system` → `bg-amber-100 text-amber-700`
- Rendered once in `layout.tsx` (alongside `AppTopBar`), not in `page.tsx` — it's persistent shell chrome that should also appear on the five new "coming soon" routes, not page-specific content.
- `page.tsx`'s two-column grid and its `NotificationsPanel` import are removed entirely (§5 already covers the resulting single-column layout).

## Edge cases

- **A group with ≤ 3 items** — no chevron/toggle, no fade overlay; just the plain row list (matches "Recent cases" today when it has few entries, and both new groups if mock data ever shrinks below the threshold).
- **`dueDate` in the future** — not "Follow up"; only strictly-past dates count as overdue. No separate "upcoming due date" treatment (deferred, matches the original spec's already-established decision to drop urgency tiers).
- **Notification badge at 0** — bell renders with no badge (not a "0" badge), matching normal notification-bell conventions.
- **`AppNavMenu` on narrow viewports** — hidden below `md` rather than wrapping or overflowing; the topbar's logo and user menu remain the only always-visible elements, matching how `MainTopBarUser`'s own dropdown already tolerates small screens today.

## Testing

Same approach as the original spec: no unit tests for this presentational/mocked work (no component-test convention in this codebase). Verification is `tsc --noEmit`, `next build`, and a manual browser walkthrough covering: the shared topbar renders identically on a marketing page and correctly with the new pill nav on `/app`; each of the 5 new nav links reaches its "coming soon" page; the greeting reads "Welcome `<name>`" with the firm name now under the name in the user menu; the stat tiles render as one row; all three Open Cases groups render, each demonstrating collapse/expand with the fade effect (all three now have > 3 mock entries); the notification bell shows the correct unread count and its dropup opens/closes on click and on outside-click, with color-coded item icons.

## What this unblocks

The `TopBarShell` extraction gives any future `/app` sub-route (the five stub pages here, and whatever real pages later sub-projects add) a ready-made shell with nav-menu injection, without re-deriving the header markup. The `dueDate`/`hasPendingEmail` fields on `CaseSummary` establish the shape sub-project #3's real case-data queries will eventually need to populate for "Follow up" and "Email arrived" to work with live data.
