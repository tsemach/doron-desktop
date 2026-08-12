# Opening/dashboard page — design

**Linear issue:** [ASC-150](https://linear.app/amicusx/issue/ASC-150/openingdashboard-page) — "Opening/dashboard page" (sub-project 2 of [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend))
**Status:** Sub-project 2 of 6 (see [ASC-105 decomposition](2026-08-10-asc-105-roadmap.md))
**Date:** 2026-08-12

## Background

Sub-project 1 (private-area shell, PR [#158](https://github.com/tsemach/doron-desktop/pull/158)) delivered `/app`: a logged-in-only shell (`AppLayout` + `AppTopBar`, no side nav) with a placeholder `apps/backend/app/app/page.tsx` that just prints "Welcome back" and a workspace label. This sub-project replaces that placeholder with a real (but mocked — no dependency on sub-project #3's data-ownership decision) overview of a lawyer's daily office work.

The starting point for content was a hand-drawn sketch of the intended app: a top nav (Cases/Tasks/Calendar/Billing/Document), a large "Open Cases" list styled after the desktop app, a cluster of stat tiles (emails to handle, meetings today, open cases + follow-up, tasks to handle), a system-notifications panel, and a chat element. Scope for this sub-project was narrowed from that sketch through brainstorming (see [Non-goals](#non-goals-explicitly-deferred)).

For the "same look and feel as Desktop" note on the sketch: the desktop app's case list (`apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/OpenCasesList.tsx` + `OpenCasesListItem.tsx`) is a bordered card containing a sticky-header table (Case info | Status | Created | actions), with color-coded status/urgency pills and a kebab action menu — not a file-explorer icon grid. This design reimplements that visual language (table, status pills, urgency tags) in the backend's own Tailwind palette, since `packages/ui` has no shared table/badge component today and the backend uses a plain slate/teal look rather than desktop's shadcn CSS-variable tokens.

## Goals

- Replace the placeholder `apps/backend/app/app/page.tsx` with a page that shows a lawyer a useful-looking summary of their day: open cases, things needing attention (emails, tasks, meetings), and recent notifications.
- Visually echo the desktop app's case list conventions (status pills, urgency tags) so the web workspace doesn't feel like a disconnected product.
- Everything is mocked, static data — no new API routes, no new DB queries beyond what sub-project 1 already added (session + firm name).

## Non-goals (explicitly deferred)

Narrowed from the original sketch during brainstorming:

- **Top nav tabs (Cases/Tasks/Calendar/Billing/Document)** — reads as app-wide navigation, not page content. Belongs to a future navigation sub-project (possibly #6, "coming soon" gating); not built here. The page renders only the body content below where those tabs would go.
- **Chat element** — a dashboard-level chat (AI assistant or messaging) is a real feature with backend implications, too large to bolt onto a mocked overview page. Left for a future sub-project.
- **Recent documents section** — originally considered, but dropped to match the sketch's actual tile set (emails/meetings/cases/tasks) rather than inventing a fifth tile not in the source sketch.
- **Case actions (edit/close/delete, kebab menu)** — the desktop table has these, but there's no case-detail page or case API in the backend yet for them to do anything real. Read-only table only.
- **Real data** — blocked on sub-project #3 (cases/documents data-ownership decision); this page uses hard-coded mock data throughout.
- **Interactivity (sort/filter/pagination)** — first pass is static presentation only.

## Design

### Layout (page body, inside the existing `AppLayout`/`AppTopBar` shell)

Two-column responsive grid, collapsing to a single stacked column below `md`:

- **Left column (wider):** Open Cases table, then the 2×2 stat-tiles grid below it.
- **Right column (narrower):** Notifications panel.

No routing or middleware changes — this is content only, inside the existing `/app` route from sub-project 1.

### Files

Following the existing `lib/<feature>/` (types/data) + `components/app/` (UI) split already used elsewhere in `apps/backend` (e.g. `lib/payments/types.ts`, `lib/email/types.ts`):

- `lib/dashboard/types.ts` — `CaseSummary`, `StatTileData`, `NotificationItem` types (below).
- `lib/dashboard/mockData.ts` — hard-coded arrays/objects satisfying those types.
- `components/app/dashboard/OpenCasesTable.tsx` — bordered card + table (Case info | Status | Created), takes `cases: CaseSummary[]`.
- `components/app/dashboard/CaseStatusBadge.tsx` — rounded pill, color per status, reimplementing desktop's `CaseStatusBadge` status→color mapping in the backend's slate/teal palette.
- `components/app/dashboard/StatTilesGrid.tsx` + `StatTile.tsx` — 2×2 grid of the 4 tiles, `lucide-react` icons (already a backend dependency, used in `app/profile/page.tsx`).
- `components/app/dashboard/NotificationsPanel.tsx` — right-column card, mocked notification list.

`apps/backend/app/app/page.tsx` stays a server component. It keeps its existing session/`firmId` → workspace-label lookup (unchanged from sub-project 1) and additionally renders the new dashboard components with data imported from `lib/dashboard/mockData.ts`. No client state anywhere — nothing on the page is interactive yet, so no `"use client"` needed in the new components.

### Data shapes (`lib/dashboard/types.ts`)

```ts
type CaseStatus = "open" | "waiting" | "closed" | "followup";
type FollowupUrgency = "overdue" | "due-today" | "upcoming";

interface CaseSummary {
  id: string;
  subject: string;       // bold, primary line — mirrors desktop's OpenCasesListItem
  name: string;           // muted line below subject
  status: CaseStatus;
  followup?: { urgency: FollowupUrgency; label: string };
  createdAt: string;      // ISO date
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

Mock content follows the sketch's numbers: 4 stat tiles (6 emails to handle, 5 meetings today, 5 open cases / 1 follow-up, 6 tasks to handle), a handful of `CaseSummary` rows with at least one `followup` example per urgency level (to exercise all three badge colors visually), and 3–5 `NotificationItem`s of mixed `type`.

### Status/urgency color mapping (`CaseStatusBadge.tsx`)

Reimplements desktop's convention in the backend palette:

- `open` → neutral/slate pill
- `waiting` → amber/yellow pill
- `closed` → gray pill
- `followup` → amber pill, plus (if `followup` is set on the case) a separate urgency tag: `overdue` = red/rose, `due-today` = amber, `upcoming` = blue — same three-tier urgency convention as desktop's `OpenCasesListItem`.

## Edge cases

- **No cases / no notifications (empty mock arrays)** — not expected in practice since data is hard-coded, but each list component renders a simple centered "nothing here" state rather than an empty table/panel, matching the desktop table's existing empty-state pattern.
- **Long case subject/name text** — truncate with ellipsis (`truncate` / `line-clamp-1`) rather than breaking the table layout, consistent with a fixed-height row table.

## Testing

Presentational/mocked content — no unit tests, per the 80/20 rule (no business logic to cover). Verification is:

- `tsc --noEmit` and lint clean.
- Manual browser check of `/app` at both desktop and mobile widths (two-column → stacked), confirming all four stat tiles, the cases table with at least one of each status/urgency color, and the notifications panel render correctly.

## What this unblocks

Once this lands, the `/app` entry point has real (if mocked) content instead of a bare placeholder. Sub-project #3's data-ownership decision can later swap `lib/dashboard/mockData.ts` for real queries without changing the component contracts (`CaseSummary`, `StatTileData`, `NotificationItem` stay the same shape). Sub-project #6 (coming-soon gating) and any future nav sub-project can build the top-tab navigation this design deliberately left out.
