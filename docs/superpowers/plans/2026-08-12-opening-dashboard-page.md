# Opening/dashboard page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sub-project-1 placeholder at `apps/backend/app/app/page.tsx` with a mocked, bird's-eye-view dashboard: a "Recent Cases" list, four stat tiles, and a notifications panel.

**Architecture:** A new `lib/dashboard/` module holds typed mock data (`CaseSummary[]`, `StatTileData[]`, `NotificationItem[]`) with no backing API or DB query. Four new presentational server components under `components/app/dashboard/` (`RecentCasesList`, `CaseStatusBadge`, `StatTilesGrid`/`StatTile`, `NotificationsPanel`) render that data inside a two-column responsive grid. `app/app/page.tsx` is modified (not replaced) to keep its existing session/`firmId` → workspace-label lookup from sub-project 1 and additionally render the new grid below it.

**Tech Stack:** Next.js 15 App Router (server components, no client state), Tailwind v4 with the shared shadcn/ui CSS-variable theme (`app/globals.css` — same token system as `apps/desktop`), `lucide-react` ^0.468.0 (already a dependency).

## Global Constraints

- **All content is static mock data.** No new API routes, no new DB queries beyond the existing session/`firmId`/firm-name lookup already in `page.tsx` from sub-project 1.
- **No `@/lib` alias exists** — only `"@/components/*": ["./components/*"]` is configured in `tsconfig.json`. Every import of `lib/dashboard/*` uses a relative path (matching the existing convention in `app/login/page.tsx`: `import { isValidEmail } from "../../lib/validation"`). Component-to-component imports use the `@/components/*` alias (matching `AppTopBar.tsx`'s own imports).
- **No unit tests for the new components.** `vitest.config.ts` only globs `**/*.test.ts` (no `.tsx` component-test convention exists anywhere in this codebase today), and this is presentational/mocked content with no business logic — matches the approved spec's Testing section. Verification is `tsc --noEmit`, `next build`, and a manual browser check.
- **Correction to the design spec:** the spec's Files section assumed `apps/backend` uses "a plain slate/teal look... rather than desktop's shadcn CSS-variable tokens." That's wrong for the `/app` shell specifically — `app/globals.css` already defines the identical shadcn/ui CSS-variable theme as `apps/desktop/src/styles/globals.css` (see its own comment: "Same design-token setup... so the web portal's register/login/plan pages render with the same shadcn/ui theme as the desktop app"), and `AppTopBar.tsx`/`MainTopBarUser.tsx` already consume those tokens (`border-border`, `bg-background/80`, `bg-primary`). (Only *older* pages like `app/profile/page.tsx` use literal slate classes — not the pattern to follow here.) All new dashboard components therefore use the token classes (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`) rather than inventing slate equivalents. Status-badge *colors* are the one exception — ported as literal Tailwind colors directly from desktop's own `CaseStatusBadge.tsx` (`bg-zinc-100`, etc.), since that's what desktop itself uses, not tokens.
- **No dark-mode variants on the ported status colors.** Desktop's `CaseStatusBadge` includes `dark:` variants, but nothing in `apps/backend`'s `/app` shell exposes a dark-mode toggle today, so they're dropped to avoid dead classes.
- Follow existing file/directory conventions: `lib/<feature>/types.ts` + `lib/<feature>/*.ts` for data (matches `lib/payments/types.ts`, `lib/email/types.ts`), `components/app/<feature>/*.tsx` for UI.

---

### Task 1: Dashboard mock data layer

**Files:**
- Create: `apps/backend/lib/dashboard/types.ts`
- Create: `apps/backend/lib/dashboard/mockData.ts`

**Interfaces:**
- Produces: `CaseStatus`, `CaseSummary`, `StatTileData`, `NotificationItem` types, exported from `apps/backend/lib/dashboard/types.ts`.
- Produces: `mockCases: CaseSummary[]` (6 entries, unsorted-safe — consumers must sort/slice), `mockStatTiles: StatTileData[]` (4 entries), `mockNotifications: NotificationItem[]` (4 entries), exported from `apps/backend/lib/dashboard/mockData.ts`. Consumed by Tasks 2–5.

This is pure data — no React, no rendering — so it's reviewable and testable in isolation via `tsc` before any component depends on it.

- [ ] **Step 1: Create the types file**

Create `apps/backend/lib/dashboard/types.ts`:

```ts
export type CaseStatus = "open" | "waiting" | "closed";

export interface CaseSummary {
  id: string;
  subject: string; // bold line, e.g. "תביעה בגין רשלנות"
  client: string; // muted line below subject
  status: CaseStatus;
  updatedAt: string; // ISO date; RecentCasesList sorts by this, most recent first
}

export interface StatTileData {
  id: string;
  icon: string; // lucide-react icon name, must be a key in StatTile.tsx's ICONS map
  primary: { count: number; label: string };
  secondary?: { count: number; label: string }; // e.g. "5 open cases" + "1 follow-up"
}

export interface NotificationItem {
  id: string;
  message: string;
  timestamp: string; // ISO date
  type: "email" | "document" | "case" | "system";
}
```

- [ ] **Step 2: Create the mock data file**

Create `apps/backend/lib/dashboard/mockData.ts`:

```ts
import type { CaseSummary, NotificationItem, StatTileData } from "./types";

// 6 entries, deliberately not pre-sorted -- RecentCasesList sorts by
// updatedAt itself. case-6 is older than the other 5 on purpose, to prove
// the "5 most recent" slice actually excludes something during manual QA.
export const mockCases: CaseSummary[] = [
  { id: "case-1", subject: "תביעה בגין רשלנות", client: "צמח מזרחי", status: "open", updatedAt: "2026-08-10" },
  { id: "case-2", subject: "בדיקת ניהול משימות", client: "צמח מזרחי", status: "waiting", updatedAt: "2026-08-09" },
  { id: "case-3", subject: "Contract Review — Acme Corp", client: "Tsemach Mizracho", status: "open", updatedAt: "2026-08-08" },
  { id: "case-4", subject: "מכירת דירה בנאמנות", client: "דורון מזרחי", status: "closed", updatedAt: "2026-08-05" },
  { id: "case-5", subject: "Employment Dispute Consultation", client: "Ronit Levi", status: "open", updatedAt: "2026-08-01" },
  { id: "case-6", subject: "Trademark Registration Inquiry", client: "Noa Cohen", status: "closed", updatedAt: "2026-07-20" },
];

// Numbers match the source sketch: 6 emails, 5 meetings, 5 open cases / 1
// follow-up, 6 tasks.
export const mockStatTiles: StatTileData[] = [
  { id: "emails", icon: "Mail", primary: { count: 6, label: "Emails to handle" } },
  { id: "meetings", icon: "CalendarClock", primary: { count: 5, label: "Meetings today" } },
  { id: "cases", icon: "Briefcase", primary: { count: 5, label: "Open cases" }, secondary: { count: 1, label: "Follow-up" } },
  { id: "tasks", icon: "ListChecks", primary: { count: 6, label: "Tasks to handle" } },
];

export const mockNotifications: NotificationItem[] = [
  { id: "notif-1", message: "New email matched to תביעה בגין רשלנות", timestamp: "2026-08-12T08:15:00Z", type: "email" },
  { id: "notif-2", message: "Document upload complete for בדיקת ניהול משימות", timestamp: "2026-08-11T17:40:00Z", type: "document" },
  { id: "notif-3", message: "Case status updated: מכירת דירה בנאמנות marked closed", timestamp: "2026-08-10T12:05:00Z", type: "case" },
  { id: "notif-4", message: "Scheduled maintenance completed successfully", timestamp: "2026-08-09T03:00:00Z", type: "system" },
];
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors. (Nothing imports these files yet, so this only validates the two files in isolation.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/lib/dashboard/types.ts apps/backend/lib/dashboard/mockData.ts
git commit -m "Add dashboard mock data layer (cases, stat tiles, notifications)"
```

---

### Task 2: Recent Cases list

**Files:**
- Create: `apps/backend/components/app/dashboard/CaseStatusBadge.tsx`
- Create: `apps/backend/components/app/dashboard/RecentCasesList.tsx`

**Interfaces:**
- Consumes: `CaseStatus`, `CaseSummary` from `apps/backend/lib/dashboard/types.ts` (Task 1).
- Produces: `CaseStatusBadge({ status: CaseStatus })`, default export from `apps/backend/components/app/dashboard/CaseStatusBadge.tsx`.
- Produces: `RecentCasesList({ cases: CaseSummary[] })`, default export from `apps/backend/components/app/dashboard/RecentCasesList.tsx`. Consumed by Task 5's `page.tsx`.

`RecentCasesList` sorts its own `cases` prop by `updatedAt` descending and slices to the 5 most recent — callers don't need to pre-sort. Status colors are ported verbatim (minus `followup` and `dark:` variants — see Global Constraints) from `apps/desktop/src/components/ui/CaseStatusBadge.tsx`.

- [ ] **Step 1: Create `CaseStatusBadge`**

Create `apps/backend/components/app/dashboard/CaseStatusBadge.tsx`:

```tsx
import type { CaseStatus } from "../../../lib/dashboard/types";

// Colors ported from apps/desktop/src/components/ui/CaseStatusBadge.tsx
// (minus the "followup" variant and dark: classes -- see plan's Global
// Constraints for why).
const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-zinc-100 text-zinc-700",
  waiting: "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  waiting: "Waiting",
  closed: "Closed",
};

type CaseStatusBadgeProps = {
  status: CaseStatus;
};

export default function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: Create `RecentCasesList`**

Create `apps/backend/components/app/dashboard/RecentCasesList.tsx`:

```tsx
import { Briefcase } from "lucide-react";
import type { CaseSummary } from "../../../lib/dashboard/types";
import CaseStatusBadge from "@/components/app/dashboard/CaseStatusBadge";

type RecentCasesListProps = {
  cases: CaseSummary[];
};

const MAX_VISIBLE_CASES = 5;

export default function RecentCasesList({ cases }: RecentCasesListProps) {
  const recent = [...cases]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_VISIBLE_CASES);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Recent Cases</h2>
      </div>
      {recent.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No recent cases</p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{c.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.client}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <CaseStatusBadge status={c.status} />
                <span className="text-xs text-muted-foreground">{c.updatedAt}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/dashboard/CaseStatusBadge.tsx apps/backend/components/app/dashboard/RecentCasesList.tsx
git commit -m "Add Recent Cases list component"
```

---

### Task 3: Stat tiles grid

**Files:**
- Create: `apps/backend/components/app/dashboard/StatTile.tsx`
- Create: `apps/backend/components/app/dashboard/StatTilesGrid.tsx`

**Interfaces:**
- Consumes: `StatTileData` from `apps/backend/lib/dashboard/types.ts` (Task 1).
- Produces: `StatTile({ tile: StatTileData })`, default export from `apps/backend/components/app/dashboard/StatTile.tsx`.
- Produces: `StatTilesGrid({ tiles: StatTileData[] })`, default export from `apps/backend/components/app/dashboard/StatTilesGrid.tsx`. Consumed by Task 5's `page.tsx`.

- [ ] **Step 1: Create `StatTile`**

Create `apps/backend/components/app/dashboard/StatTile.tsx`:

```tsx
import { Briefcase, CalendarClock, ListChecks, Mail, type LucideIcon } from "lucide-react";
import type { StatTileData } from "../../../lib/dashboard/types";

// Keys must match the `icon` values used in lib/dashboard/mockData.ts.
const ICONS: Record<string, LucideIcon> = { Mail, CalendarClock, Briefcase, ListChecks };

type StatTileProps = {
  tile: StatTileData;
};

export default function StatTile({ tile }: StatTileProps) {
  const Icon = ICONS[tile.icon];

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{tile.primary.label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">
        {tile.primary.count}
        {tile.secondary && (
          <span className="ml-2 text-sm font-medium text-muted-foreground">
            · {tile.secondary.count} {tile.secondary.label}
          </span>
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `StatTilesGrid`**

Create `apps/backend/components/app/dashboard/StatTilesGrid.tsx`:

```tsx
import type { StatTileData } from "../../../lib/dashboard/types";
import StatTile from "@/components/app/dashboard/StatTile";

type StatTilesGridProps = {
  tiles: StatTileData[];
};

export default function StatTilesGrid({ tiles }: StatTilesGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {tiles.map((tile) => (
        <StatTile key={tile.id} tile={tile} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/dashboard/StatTile.tsx apps/backend/components/app/dashboard/StatTilesGrid.tsx
git commit -m "Add stat tiles grid component"
```

---

### Task 4: Notifications panel

**Files:**
- Create: `apps/backend/components/app/dashboard/NotificationsPanel.tsx`

**Interfaces:**
- Consumes: `NotificationItem` from `apps/backend/lib/dashboard/types.ts` (Task 1).
- Produces: `NotificationsPanel({ notifications: NotificationItem[] })`, default export from `apps/backend/components/app/dashboard/NotificationsPanel.tsx`. Consumed by Task 5's `page.tsx`.

- [ ] **Step 1: Create `NotificationsPanel`**

Create `apps/backend/components/app/dashboard/NotificationsPanel.tsx`:

```tsx
import { Bell, Briefcase, FileText, Mail, type LucideIcon } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";

const TYPE_ICONS: Record<NotificationItem["type"], LucideIcon> = {
  email: Mail,
  document: FileText,
  case: Briefcase,
  system: Bell,
};

type NotificationsPanelProps = {
  notifications: NotificationItem[];
};

export default function NotificationsPanel({ notifications }: NotificationsPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
      </div>
      {notifications.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications</p>
      ) : (
        <ul className="divide-y divide-border">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type];
            return (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(n.timestamp).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/components/app/dashboard/NotificationsPanel.tsx
git commit -m "Add notifications panel component"
```

---

### Task 5: Wire the dashboard into `/app`

**Files:**
- Modify: `apps/backend/app/app/page.tsx` (full file, currently 24 lines, unchanged since sub-project 1)

**Interfaces:**
- Consumes: `RecentCasesList` (Task 2), `StatTilesGrid` (Task 3), `NotificationsPanel` (Task 4), `mockCases`/`mockStatTiles`/`mockNotifications` (Task 1).
- Produces: the final rendered `/app` route content. Nothing downstream depends on this file's shape — it's the top of the tree.

Keeps the existing `auth()` → `firmId` → firm-name lookup byte-for-byte (that's sub-project 1's territory, not this plan's), and replaces only the placeholder `<div>` with the two-column grid: `RecentCasesList` + `StatTilesGrid` stacked in the wider left column, `NotificationsPanel` alone in the narrower right column, collapsing to one column below `lg`. Also switches the greeting text from literal `text-slate-900`/`text-slate-500` to the token classes (`text-foreground`/`text-muted-foreground`) used by the rest of the `/app` shell, since this task is already touching those two lines.

- [ ] **Step 1: Replace the page content**

Replace the full contents of `apps/backend/app/app/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";
import { mockCases, mockNotifications, mockStatTiles } from "../../lib/dashboard/mockData";
import RecentCasesList from "@/components/app/dashboard/RecentCasesList";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";
import NotificationsPanel from "@/components/app/dashboard/NotificationsPanel";

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
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
      <p className="text-sm text-muted-foreground mt-1">{workspaceLabel}</p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <RecentCasesList cases={mockCases} />
          <StatTilesGrid tiles={mockStatTiles} />
        </div>
        <div>
          <NotificationsPanel notifications={mockNotifications} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Manual check**

With the dev server running, log in and visit `http://localhost:3000/app`:
- "Welcome back" + workspace label still render above the grid, unchanged from sub-project 1.
- Left column: Recent Cases list shows exactly 5 rows (not 6 — `case-6`/"Trademark Registration Inquiry" must be excluded as the oldest `updatedAt`), each with subject (bold), client (muted, below), a colored status pill, and a date. Hebrew subjects/clients render correctly right-to-left inline.
- Below it, a 2×2 grid of 4 stat tiles (Emails to handle: 6, Meetings today: 5, Open cases: 5 · 1 Follow-up, Tasks to handle: 6).
- Right column: Notifications panel with 4 items, each with a small type icon, message, and a formatted timestamp.
- Resize the window below `1024px` (the `lg` breakpoint) — the two columns collapse into a single stacked column: cases list, then stat tiles, then notifications.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/app/page.tsx
git commit -m "Wire mocked dashboard (recent cases, stat tiles, notifications) into /app"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: clean, no errors anywhere in `apps/backend`.

- [ ] **Step 2: Full build**

Run: `pnpm --filter backend build`
Expected: succeeds with no new warnings for `/app` or the new `components/app/dashboard/*`/`lib/dashboard/*` files.

- [ ] **Step 3: Full backend test suite (regression check)**

Run: `pnpm --filter backend test`
Expected: all existing tests still pass — this plan added no `.test.ts` files, so the count should be unchanged from before this plan started.

- [ ] **Step 4: Manual walkthrough against the spec's testing section**

With the dev server running, logged in, at `/app`:
1. Confirm all 4 stat tiles render with the correct counts/labels (Task 5, Step 3 above).
2. Confirm the Recent Cases list shows 5 (not 6) rows, sorted most-recent-first, with at least one `open`, one `waiting`, and one `closed` status pill visible among them.
3. Confirm the notifications panel renders all 4 mocked items with distinct type icons.
4. Confirm the layout collapses correctly on a narrow (mobile-width) viewport.

- [ ] **Step 5: Commit (if any fixups were needed)**

Only if Step 4 surfaced an issue requiring a code change — otherwise this task produces no commit of its own; it's a verification gate on the five commits already made.

## Spec coverage check

- Two-column responsive layout (Recent Cases + stat tiles left, notifications right, collapsing below `lg`) — Task 5.
- `lib/dashboard/types.ts` + `mockData.ts` matching the spec's exact `CaseSummary`/`StatTileData`/`NotificationItem` shapes — Task 1.
- `RecentCasesList` (bordered card, plain divided list, icon + subject/client + status pill + date, sorted by recency, no urgency tag, no actions) — Task 2.
- `CaseStatusBadge` (open/waiting/closed colors ported from desktop, no followup tier) — Task 2.
- `StatTilesGrid`/`StatTile` (4 tiles, 2×2, matching the sketch's numbers) — Task 3.
- `NotificationsPanel` (mocked list, no interactivity) — Task 4.
- Edge cases from the spec: empty-state text (both list components), truncation on long subject/client text (`truncate`), Hebrew/English mixed text with no special `dir` handling — Task 2 and Task 5 cover the rendering; Hebrew text is exercised directly by the mock data itself.
- Non-goals respected: no top nav tabs, no chat, no documents tile, no case actions/kebab menu, no urgency tags, no "view all"/pagination, no real data, no sort/filter interactivity — none of these appear anywhere in Tasks 1–5.
