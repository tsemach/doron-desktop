# Opening/dashboard page — design

**Linear issue:** [ASC-150](https://linear.app/amicusx/issue/ASC-150/openingdashboard-page) — "Opening/dashboard page" (sub-project 2 of [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend))
**Status:** Sub-project 2 of 6 (see [ASC-105 decomposition](2026-08-10-asc-105-roadmap.md))
**Date:** 2026-08-12

## Background

Sub-project 1 (private-area shell, PR [#158](https://github.com/tsemach/doron-desktop/pull/158)) delivered `/app`: a logged-in-only shell (`AppLayout` + `AppTopBar`, no side nav) with a placeholder `apps/backend/app/app/page.tsx` that just prints "Welcome back" and a workspace label. This sub-project replaces that placeholder with a real (but mocked — no dependency on sub-project #3's data-ownership decision) overview of a lawyer's daily office work.

The starting point for content was a hand-drawn sketch of the intended app: a top nav (Cases/Tasks/Calendar/Billing/Document), a large "Open Cases" list styled after the desktop app, a cluster of stat tiles (emails to handle, meetings today, open cases + follow-up, tasks to handle), a system-notifications panel, and a chat element. Scope for this sub-project was narrowed from that sketch through brainstorming (see [Non-goals](#non-goals-explicitly-deferred)).

A follow-up mock of just the cases section reset the "same look and feel as Desktop" note: this page is a **bird's-eye view**, not the desktop app's detailed case management. The desktop case list (`apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesList.tsx` + `OpenCasesListItem.tsx`) is a bordered card with a sticky-header table (Case info | Status | Created | actions), color-coded status/urgency pills, and a kebab action menu. This design borrows only the light-touch pieces of that (a bordered card, a color-coded status pill) and drops the table/column chrome, urgency tags, and actions entirely in favor of a plain list: icon, subject + client, status pill + date. See `RecentCasesList.tsx` under [Files](#files) below.

## Goals

- Replace the placeholder `apps/backend/app/app/page.tsx` with a page that shows a lawyer a bird's-eye summary of their day: recent cases, things needing attention (emails, tasks, meetings), and recent notifications — not the desktop app's detailed case management.
- Visually echo the desktop app's case list conventions (status pills, urgency tags) so the web workspace doesn't feel like a disconnected product.
- Everything is mocked, static data — no new API routes, no new DB queries beyond what sub-project 1 already added (session + firm name).

## Non-goals (explicitly deferred)

Narrowed from the original sketch during brainstorming:

- **Top nav tabs (Cases/Tasks/Calendar/Billing/Document)** — reads as app-wide navigation, not page content. Belongs to a future navigation sub-project (possibly #6, "coming soon" gating); not built here. The page renders only the body content below where those tabs would go.
- **Chat element** — a dashboard-level chat (AI assistant or messaging) is a real feature with backend implications, too large to bolt onto a mocked overview page. Left for a future sub-project.
- **Recent documents section** — originally considered, but dropped to match the sketch's actual tile set (emails/meetings/cases/tasks) rather than inventing a fifth tile not in the source sketch.
- **Case actions (edit/close/delete, kebab menu)** — the desktop table has these, but there's no case-detail page or case API in the backend yet for them to do anything real. Read-only list only.
- **Urgency/followup tags on case rows** — desktop shows a separate overdue/due-today/upcoming pill per case; dropped here since this is a bird's-eye summary, not detailed case management, and it wasn't in the cases-section mock. Selection is purely by recency (see below), not urgency.
- **Full case table (all open cases, sortable columns)** — this is a "recent cases" glance, not a case list/management view. Only a handful of the most-recently-updated cases are shown; no "view all" link or pagination in this pass.
- **Real data** — blocked on sub-project #3 (cases/documents data-ownership decision); this page uses hard-coded mock data throughout.
- **Interactivity (sort/filter/pagination)** — first pass is static presentation only.

## Design

### Layout (page body, inside the existing `AppLayout`/`AppTopBar` shell)

Two-column responsive grid, collapsing to a single stacked column below `md`:

- **Left column (wider):** Recent Cases list, then the 2×2 stat-tiles grid below it.
- **Right column (narrower):** Notifications panel.

No routing or middleware changes — this is content only, inside the existing `/app` route from sub-project 1.

### Files

Following the existing `lib/<feature>/` (types/data) + `components/app/` (UI) split already used elsewhere in `apps/backend` (e.g. `lib/payments/types.ts`, `lib/email/types.ts`):

- `lib/dashboard/types.ts` — `CaseSummary`, `StatTileData`, `NotificationItem` types (below).
- `lib/dashboard/mockData.ts` — hard-coded arrays/objects satisfying those types.
- `components/app/dashboard/RecentCasesList.tsx` — bordered card, "Recent Cases" heading, a plain divided list (not a `<table>`) of the most-recently-updated `cases: CaseSummary[]`. Each row: icon (rounded gray square) + subject (bold) + client (muted, below) on the left; status pill + date stacked, right-aligned.
- `components/app/dashboard/CaseStatusBadge.tsx` — rounded pill, color per status, reimplementing desktop's `CaseStatusBadge` status→color mapping in the backend's slate/teal palette. No separate urgency tier (see Non-goals).
- `components/app/dashboard/StatTilesGrid.tsx` + `StatTile.tsx` — 2×2 grid of the 4 tiles, `lucide-react` icons (already a backend dependency, used in `app/profile/page.tsx`).
- `components/app/dashboard/NotificationsPanel.tsx` — right-column card, mocked notification list.

`apps/backend/app/app/page.tsx` stays a server component. It keeps its existing session/`firmId` → workspace-label lookup (unchanged from sub-project 1) and additionally renders the new dashboard components with data imported from `lib/dashboard/mockData.ts`. No client state anywhere — nothing on the page is interactive yet, so no `"use client"` needed in the new components.

### Data shapes (`lib/dashboard/types.ts`)

```ts
type CaseStatus = "open" | "waiting" | "closed";

interface CaseSummary {
  id: string;
  subject: string;   // bold line, e.g. "תביעה בגין רשלנות" — Hebrew/English mixed, matching real usage
  client: string;     // muted line below, e.g. "Tsemach Mizracho"
  status: CaseStatus; // color-coded pill
  updatedAt: string;  // ISO date; list sort key, most recent first
}

interface StatTileData {
  id: string;
  icon: string;           // lucide-react icon name
  primary: { count: number; label: string };
  secondary?: { count: number; label: string }; // e.g. "5 open cases" + "1 follow-up"
}

interface NotificationItem {
  id: string;
  message: string;
  timestamp: string;      // ISO date
  type: "email" | "document" | "case" | "system";
}
```

Mock content follows the sketch's numbers: 4 stat tiles (6 emails to handle, 5 meetings today, 5 open cases / 1 follow-up, 6 tasks to handle), the **5 most-recently-updated** `CaseSummary` rows (sorted by `updatedAt` descending, no overdue bumping), covering at least one of each status, and 3–5 `NotificationItem`s of mixed `type`. Text is mixed Hebrew/English, matching real case data (see the RTL note in Edge cases).

### Status color mapping (`CaseStatusBadge.tsx`)

Reimplements desktop's per-status colors in the backend palette — `open` → neutral/slate pill, `waiting` → amber/yellow pill, `closed` → gray pill. No separate urgency tier in this pass (see Non-goals).

## Edge cases

- **No cases / no notifications (empty mock arrays)** — not expected in practice since data is hard-coded, but each list component renders a simple centered "nothing here" state rather than an empty list/panel, matching the desktop table's existing empty-state pattern.
- **Long case subject/client text** — truncate with ellipsis (`truncate` / `line-clamp-1`) rather than wrapping and breaking row height.
- **Mixed Hebrew/English text** (e.g. Hebrew `subject`/`client` alongside English ones) — no special `dir` handling needed; the browser's Unicode bidi algorithm renders RTL runs correctly inline within the page's LTR layout automatically, same as unstyled text elsewhere in the app.

## Testing

Presentational/mocked content — no unit tests, per the 80/20 rule (no business logic to cover). Verification is:

- `tsc --noEmit` and lint clean.
- Manual browser check of `/app` at both desktop and mobile widths (two-column → stacked), confirming all four stat tiles, the Recent Cases list with at least one of each status color, and the notifications panel render correctly.

## What this unblocks

Once this lands, the `/app` entry point has real (if mocked) content instead of a bare placeholder. Sub-project #3's data-ownership decision can later swap `lib/dashboard/mockData.ts` for real queries without changing the component contracts (`CaseSummary`, `StatTileData`, `NotificationItem` stay the same shape). Sub-project #6 (coming-soon gating) and any future nav sub-project can build the top-tab navigation this design deliberately left out.
