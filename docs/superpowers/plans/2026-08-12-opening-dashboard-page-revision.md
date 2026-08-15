# Opening/dashboard page — revision round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 6-part revision round to the already-built `/app` dashboard: a shared-base topbar nav menu with 5 coming-soon routes, a relocated greeting/workspace-label, single-row stat tiles on a left-aligned full-width page, "Open cases" split into three collapsible groups, and a floating color-coded notification dropup.

**Architecture:** A new `TopBarShell` component absorbs the header markup duplicated between `MainTopBar.tsx` (marketing) and `AppTopBar.tsx` (dashboard), taking an injectable `nav` slot — marketing keeps its plain-link nav, dashboard gets a new pill-segmented `AppNavMenu`. `CaseSummary` gains two optional fields (`dueDate`, `hasPendingEmail`) that back three independent filtered views (`CaseGroup` instances) inside a new `OpenCasesPanel`, replacing the flat `RecentCasesList`. Notifications move from a static right-column card to a fixed bottom-right `NotificationBell` that reuses the existing `NotificationsPanel` as its dropup body. `layout.tsx` picks up the firm-name lookup (since the topbar needs it) and renders the bell so both persist across the new coming-soon routes.

**Tech Stack:** Same as the rest of `apps/backend` — Next.js 15 App Router (server components by default, `"use client"` only where interactivity/hooks are needed), Tailwind v4 with the shared shadcn CSS-variable token theme, `lucide-react` (already a dependency — no new packages).

## Global Constraints

- **No new dependencies.** The collapse/fade and dropup interactions use plain CSS transitions (`transition-[max-height]`, `transition-opacity`) inside small client components — no animation library.
- **Import convention, unchanged from the original plan:** `lib/dashboard/*` is imported with a relative path from `components/app/dashboard/*.tsx` (three levels up: `../../../lib/dashboard/...`) and from `app/app/*.tsx` (two levels up: `../../lib/dashboard/...`) — there is no `@/lib` alias. Component-to-component imports use the `@/components/*` alias.
- **No unit tests.** Same rationale as the original plan: `vitest.config.ts` only globs `**/*.test.ts`, no component-test convention exists, and this is presentational/mocked content. Verification is `tsc --noEmit`, `next build`, and a manual browser walkthrough.
- **`AppNavMenu`'s 5 routes must exactly match its 5 `href`s**: `/app/cases`, `/app/tasks`, `/app/calendar`, `/app/billing`, `/app/documents` — spelled and cased exactly this way in both the nav menu and the route folder names.
- **A destructured prop must never be named the bare word `case`** (a reserved word in switch statements — legal as a property/variable name but needlessly confusing here); use `caseItem` instead, consistently across `CaseRow`, `CaseGroup`, and `OpenCasesPanel`.
- **`MainTopBar.tsx`'s visual output must not change** after Task 4 — it's a structural extraction (shared shell), not a redesign of the marketing site.
- **Status pill / card styling stays consistent with the original plan's tokens**: `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `rounded-xl`, `shadow-xs` for cards; the new per-type notification icon colors and the pill-nav classes below are literal Tailwind colors layered on top, same pattern as `CaseStatusBadge`'s literal status colors.

---

### Task 1: Case data model — `dueDate` / `hasPendingEmail` + expanded mock data

**Files:**
- Modify: `apps/backend/lib/dashboard/types.ts` (full file, currently 26 lines)
- Modify: `apps/backend/lib/dashboard/mockData.ts` (full file, currently 31 lines)

**Interfaces:**
- Produces: `CaseSummary` gains `dueDate?: string` and `hasPendingEmail?: boolean`, exported from `apps/backend/lib/dashboard/types.ts`.
- Produces: `mockCases: CaseSummary[]` grows from 6 to 9 entries (`case-7`, `case-8`, `case-9` added), exported from `apps/backend/lib/dashboard/mockData.ts`. Consumed by Task 7 (`OpenCasesPanel`) via `page.tsx` in Task 9.

The 3 new/modified fields must produce, when filtered by "dueDate in the past" and "hasPendingEmail true" respectively, more than 3 matches each — this is what lets Task 6/7's collapse-and-fade behavior actually be exercised in every group, not just "Recent cases" (which already has 5).

- [ ] **Step 1: Update the types file**

Replace the full contents of `apps/backend/lib/dashboard/types.ts`:

```ts
export type CaseStatus = "open" | "waiting" | "closed";

export interface CaseSummary {
  id: string;
  subject: string; // bold line, e.g. "תביעה בגין רשלנות"
  client: string; // muted line below subject
  status: CaseStatus;
  updatedAt: string; // ISO date; "Recent cases" group sorts by this, most recent first
  dueDate?: string; // ISO date; "Follow up" group = dueDate in the past
  hasPendingEmail?: boolean; // "Email arrived" group = true
}

export type StatTileIcon = "Mail" | "CalendarClock" | "Briefcase" | "ListChecks";

export interface StatTileData {
  id: string;
  icon: StatTileIcon; // lucide-react icon name, must be a key in StatTile.tsx's ICONS map
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

- [ ] **Step 2: Update the mock data file**

Replace the full contents of `apps/backend/lib/dashboard/mockData.ts`:

```ts
import type { CaseSummary, NotificationItem, StatTileData } from "./types";

// 9 entries. "Recent cases" (top 5 by updatedAt) is unaffected by the 3
// newest additions (case-7/8/9), since all three have older updatedAt
// values than the existing top 5 -- case-6 stays the "excluded oldest of
// the original set" for that group. dueDate/hasPendingEmail are set so
// both the "Follow up" and "Email arrived" groups have 5 matches each
// (more than the 3-item collapse threshold), with case-9 deliberately in
// both groups to exercise a case appearing in more than one group.
export const mockCases: CaseSummary[] = [
  { id: "case-1", subject: "תביעה בגין רשלנות", client: "צמח מזרחי", status: "open", updatedAt: "2026-08-10", hasPendingEmail: true },
  { id: "case-2", subject: "בדיקת ניהול משימות", client: "צמח מזרחי", status: "waiting", updatedAt: "2026-08-09", dueDate: "2026-08-05" },
  { id: "case-3", subject: "Contract Review — Acme Corp", client: "Tsemach Mizracho", status: "open", updatedAt: "2026-08-08", hasPendingEmail: true },
  { id: "case-4", subject: "מכירת דירה בנאמנות", client: "דורון מזרחי", status: "closed", updatedAt: "2026-08-05", dueDate: "2026-08-01" },
  { id: "case-5", subject: "Employment Dispute Consultation", client: "Ronit Levi", status: "open", updatedAt: "2026-08-01", hasPendingEmail: true },
  { id: "case-6", subject: "Trademark Registration Inquiry", client: "Noa Cohen", status: "closed", updatedAt: "2026-07-20", dueDate: "2026-07-25" },
  { id: "case-7", subject: "בקשה לצו מניעה", client: "אורית כהן", status: "waiting", updatedAt: "2026-07-15", dueDate: "2026-08-03" },
  { id: "case-8", subject: "Divorce Settlement Review", client: "David Cohen", status: "open", updatedAt: "2026-07-10", hasPendingEmail: true },
  { id: "case-9", subject: "רישוי עסק חדש", client: "משה לוי", status: "open", updatedAt: "2026-07-05", dueDate: "2026-07-30", hasPendingEmail: true },
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
Expected: no new type errors. (`RecentCasesList.tsx` still compiles against the widened `CaseSummary` — the two new fields are optional, so nothing breaks yet.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/lib/dashboard/types.ts apps/backend/lib/dashboard/mockData.ts
git commit -m "Add dueDate/hasPendingEmail to CaseSummary, expand mock cases to 9"
```

---

### Task 2: `AppNavMenu` — dashboard pill nav

**Files:**
- Create: `apps/backend/components/app/AppNavMenu.tsx`

**Interfaces:**
- Produces: `AppNavMenu()` (no props), default export from `apps/backend/components/app/AppNavMenu.tsx`. Consumed by Task 5's `AppTopBar.tsx`.

Visual structure ported class-for-class from `apps/desktop/src/components/DocsManagement/DocsManagementHeader.tsx:73-156`'s segmented toolbar (same CSS-variable tokens, directly portable).

- [ ] **Step 1: Create `AppNavMenu`**

Create `apps/backend/components/app/AppNavMenu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarClock, CreditCard, FileText, ListChecks, type LucideIcon } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Cases", href: "/app/cases", icon: Briefcase },
  { label: "Tasks", href: "/app/tasks", icon: ListChecks },
  { label: "Calendar", href: "/app/calendar", icon: CalendarClock },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
  { label: "Documents", href: "/app/documents", icon: FileText },
];

export default function AppNavMenu() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center bg-muted/60 p-1 rounded-lg border border-border/40">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${
              active
                ? "bg-background text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors. (Not imported anywhere yet, so this only validates the file in isolation.)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/components/app/AppNavMenu.tsx
git commit -m "Add AppNavMenu pill-nav component for the dashboard topbar"
```

---

### Task 3: "Coming soon" routes

**Files:**
- Create: `apps/backend/components/app/ComingSoon.tsx`
- Create: `apps/backend/app/app/cases/page.tsx`
- Create: `apps/backend/app/app/tasks/page.tsx`
- Create: `apps/backend/app/app/calendar/page.tsx`
- Create: `apps/backend/app/app/billing/page.tsx`
- Create: `apps/backend/app/app/documents/page.tsx`

**Interfaces:**
- Produces: `ComingSoon({ feature: string })`, default export from `apps/backend/components/app/ComingSoon.tsx`. Consumed by the 5 route pages below.
- Produces: 5 routes at `/app/cases`, `/app/tasks`, `/app/calendar`, `/app/billing`, `/app/documents` — the exact paths Task 2's `AppNavMenu` links to. Each is nested under `apps/backend/app/app/`, so `app/app/layout.tsx`'s existing auth gate and topbar wrap it automatically with no further wiring.

- [ ] **Step 1: Create `ComingSoon`**

Create `apps/backend/components/app/ComingSoon.tsx`:

```tsx
import { Sparkles } from "lucide-react";

type ComingSoonProps = {
  feature: string;
};

export default function ComingSoon({ feature }: ComingSoonProps) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
        <Sparkles className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-bold text-foreground">{feature} is coming soon</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This part of Ascurix is still being built. Check back soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the 5 route pages**

Create `apps/backend/app/app/cases/page.tsx`:

```tsx
import ComingSoon from "@/components/app/ComingSoon";

export default function CasesComingSoonPage() {
  return <ComingSoon feature="Cases" />;
}
```

Create `apps/backend/app/app/tasks/page.tsx`:

```tsx
import ComingSoon from "@/components/app/ComingSoon";

export default function TasksComingSoonPage() {
  return <ComingSoon feature="Tasks" />;
}
```

Create `apps/backend/app/app/calendar/page.tsx`:

```tsx
import ComingSoon from "@/components/app/ComingSoon";

export default function CalendarComingSoonPage() {
  return <ComingSoon feature="Calendar" />;
}
```

Create `apps/backend/app/app/billing/page.tsx`:

```tsx
import ComingSoon from "@/components/app/ComingSoon";

export default function BillingComingSoonPage() {
  return <ComingSoon feature="Billing" />;
}
```

Create `apps/backend/app/app/documents/page.tsx`:

```tsx
import ComingSoon from "@/components/app/ComingSoon";

export default function DocumentsComingSoonPage() {
  return <ComingSoon feature="Documents" />;
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/ComingSoon.tsx apps/backend/app/app/cases apps/backend/app/app/tasks apps/backend/app/app/calendar apps/backend/app/app/billing apps/backend/app/app/documents
git commit -m "Add coming-soon placeholder routes for the 5 nav menu items"
```

---

### Task 4: Shared `TopBarShell` + `MainTopBarUser` workspace label + `MainTopBar` refactor

**Files:**
- Create: `apps/backend/components/main/TopBarShell.tsx`
- Modify: `apps/backend/components/main/MainTopBarUser.tsx` (full file, currently 121 lines)
- Modify: `apps/backend/components/main/MainTopBar.tsx` (full file, currently 42 lines)

**Interfaces:**
- Produces: `MainTopBarUser({ userName: string | null; tier?: string | null; workspaceLabel?: string | null; handleLogout: () => void })` — `workspaceLabel` is new and optional; every existing caller that doesn't pass it (i.e. `MainTopBar`, after this task) is unaffected.
- Produces: `TopBarShell({ logoHref: string; nav: React.ReactNode; userName: string | null; tier?: string | null; workspaceLabel?: string | null; handleLogout: () => void })`, default export from `apps/backend/components/main/TopBarShell.tsx`. Consumed by `MainTopBar.tsx` (this task) and Task 5's `AppTopBar.tsx`.
- Consumes: `MainTopBarLogo` (existing, unchanged), `MainTopBarUser` (this task's updated version).

- [ ] **Step 1: Add `workspaceLabel` to `MainTopBarUser`**

Replace the full contents of `apps/backend/components/main/MainTopBarUser.tsx`:

```tsx
import { LayoutDashboard, LogOut, Settings, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type MainTopBarUserProps = {
  // null = not signed in -- renders a "Log in" link instead of the
  // name/avatar/dropdown, since the portal no longer requires login to browse.
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
  handleLogout: () => void;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  ultra: "Ultra",
};

export default function MainTopBarUser({ userName, tier, workspaceLabel, handleLogout }: MainTopBarUserProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isInWorkspace = pathname === "/app" || pathname.startsWith("/app/");

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!userName) {
    return (
      <Link
        href="/login"
        className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
      >
        Log in
      </Link>
    );
  }

  const tierLabel = TIER_LABELS[tier ?? "free"] ?? "Free";
  const isUpgradeable = tier !== "pro" && tier !== "ultra";

  return (
    <div className="flex items-center gap-3">

      {!isInWorkspace && (
        <Link
          href="/app"
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-brand-accent text-brand-accent hover:bg-brand-accent/10 transition-all cursor-pointer"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Desktop
        </Link>
      )}

      <div className="flex flex-col leading-tight select-none">
        <span className="text-sm font-semibold text-foreground">
          {userName} <span className="text-muted-foreground">({tierLabel})</span>
        </span>
        {workspaceLabel && <span className="text-xs text-muted-foreground">{workspaceLabel}</span>}
      </div>

      {isUpgradeable && (
        <Link
          href="/register/plan"
          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
        >
          Upgrade
        </Link>
      )}

      <div className="relative w-fit" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-border hover:border-foreground/30 bg-muted/60 text-foreground hover:text-foreground transition-all cursor-pointer"
        >
          <User className="w-4 h-4" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-[-18px] mt-2 w-28 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 flex items-center gap-2 cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            Profile
          </Link>
          <button
            onClick={() => {
              setDropdownOpen(false);
              alert("Settings page coming soon!");
            }}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 flex items-center gap-2 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <div className="border-t border-border my-1"></div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `TopBarShell`**

Create `apps/backend/components/main/TopBarShell.tsx`:

```tsx
"use client";

import MainTopBarLogo from "./MainTopBarLogo";
import MainTopBarUser from "./MainTopBarUser";

type TopBarShellProps = {
  logoHref: string;
  nav: React.ReactNode;
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
  handleLogout: () => void;
};

export default function TopBarShell({ logoHref, nav, userName, tier, workspaceLabel, handleLogout }: TopBarShellProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <MainTopBarLogo href={logoHref} />
        {nav}
      </div>
      <MainTopBarUser userName={userName} tier={tier} workspaceLabel={workspaceLabel} handleLogout={handleLogout} />
    </header>
  );
}
```

- [ ] **Step 3: Refactor `MainTopBar` to use `TopBarShell`**

Replace the full contents of `apps/backend/components/main/MainTopBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import TopBarShell from "./TopBarShell";
import MainTopBarResourcesDropdown from "./MainTopBarResourcesDropdown";

type Props = {
  userName: string | null;
  tier?: string | null;
  handleLogout: () => void;
}

const NAV_LINKS = [
  { label: "Products", href: "/products" },
  { label: "Download", href: "/download" },
  { label: "Pricing", href: "/pricing" },
];

export default function MainTopBar({ userName, tier, handleLogout }: Props) {
  return (
    <TopBarShell
      logoHref="/home"
      userName={userName}
      tier={tier}
      handleLogout={handleLogout}
      nav={
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
          <MainTopBarResourcesDropdown />
        </nav>
      }
    />
  );
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Manual check — marketing topbar unchanged**

With the dev server running, visit `/pricing` (or any marketing page) logged out and logged in. Expect the topbar to look and behave exactly as before this task: logo on the left, Products/Download/Pricing + Resources dropdown next to it, user menu (or "Log in") on the right — no visible workspace-label line, since `MainTopBar` never passes `workspaceLabel`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/components/main/TopBarShell.tsx apps/backend/components/main/MainTopBarUser.tsx apps/backend/components/main/MainTopBar.tsx
git commit -m "Extract shared TopBarShell from MainTopBar, add workspaceLabel to MainTopBarUser"
```

---

### Task 5: `AppTopBar` refactor to use `TopBarShell` + `AppNavMenu`

**Files:**
- Modify: `apps/backend/components/app/AppTopBar.tsx` (full file, currently 23 lines)

**Interfaces:**
- Consumes: `TopBarShell` (Task 4), `AppNavMenu` (Task 2).
- Produces: `AppTopBar({ userName: string | null; tier?: string | null; workspaceLabel?: string | null })`, default export — `workspaceLabel` is a new prop. Consumed by Task 9's `layout.tsx`.

- [ ] **Step 1: Replace `AppTopBar`**

Replace the full contents of `apps/backend/components/app/AppTopBar.tsx`:

```tsx
"use client";

import { signOut } from "next-auth/react";
import TopBarShell from "@/components/main/TopBarShell";
import AppNavMenu from "@/components/app/AppNavMenu";

type AppTopBarProps = {
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
};

export default function AppTopBar({ userName, tier, workspaceLabel }: AppTopBarProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <TopBarShell
      logoHref="/home"
      userName={userName}
      tier={tier}
      workspaceLabel={workspaceLabel}
      handleLogout={handleLogout}
      nav={<AppNavMenu />}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors. (`layout.tsx` still calls `<AppTopBar userName={...} tier={...} />` without `workspaceLabel` until Task 9 — that's fine, the prop is optional.)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/components/app/AppTopBar.tsx
git commit -m "Refactor AppTopBar to use TopBarShell and AppNavMenu"
```

---

### Task 6: `CaseRow` + `CaseGroup` — collapsible group with fade

**Files:**
- Create: `apps/backend/components/app/dashboard/CaseRow.tsx`
- Create: `apps/backend/components/app/dashboard/CaseGroup.tsx`

**Interfaces:**
- Consumes: `CaseSummary` (Task 1), `CaseStatusBadge` (existing, unchanged), `formatDashboardDate` (existing, unchanged).
- Produces: `CaseRow({ caseItem: CaseSummary })`, default export from `apps/backend/components/app/dashboard/CaseRow.tsx`.
- Produces: `CaseGroup({ title: string; cases: CaseSummary[] })`, default export from `apps/backend/components/app/dashboard/CaseGroup.tsx`. Consumed by Task 7's `OpenCasesPanel.tsx`.

`CaseRow` is the existing per-case row markup extracted verbatim from today's `RecentCasesList.tsx` (which Task 7 deletes). `CaseGroup` shows up to 3 rows when collapsed (the default state) with a bottom fade overlay if there are more, and expands to the full list on click — both the list's `max-height` and the overlay's opacity transition together over 300ms. Groups with 3 or fewer cases render with no chevron and no toggle behavior (nothing to expand).

- [ ] **Step 1: Create `CaseRow`**

Create `apps/backend/components/app/dashboard/CaseRow.tsx`:

```tsx
import { Briefcase } from "lucide-react";
import type { CaseSummary } from "../../../lib/dashboard/types";
import { formatDashboardDate } from "../../../lib/dashboard/formatDate";
import CaseStatusBadge from "@/components/app/dashboard/CaseStatusBadge";

type CaseRowProps = {
  caseItem: CaseSummary;
};

export default function CaseRow({ caseItem }: CaseRowProps) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Briefcase className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{caseItem.subject}</p>
          <p className="truncate text-xs text-muted-foreground">{caseItem.client}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <CaseStatusBadge status={caseItem.status} />
        <span className="text-xs text-muted-foreground">{formatDashboardDate(caseItem.updatedAt)}</span>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Create `CaseGroup`**

Create `apps/backend/components/app/dashboard/CaseGroup.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CaseSummary } from "../../../lib/dashboard/types";
import CaseRow from "@/components/app/dashboard/CaseRow";

type CaseGroupProps = {
  title: string;
  cases: CaseSummary[];
};

const COLLAPSED_VISIBLE_COUNT = 3;
// Approximate height of 3 CaseRows (each ~56px with its px-4 py-3 padding
// and two lines of text) -- just needs to visually cut off around the
// 3rd row, not be pixel-exact, since this is mocked content.
const COLLAPSED_MAX_HEIGHT = "168px";

export default function CaseGroup({ title, cases }: CaseGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = cases.length > COLLAPSED_VISIBLE_COUNT;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasOverflow && setExpanded((prev) => !prev)}
        disabled={!hasOverflow}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/40 text-left disabled:cursor-default"
      >
        {hasOverflow ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">({cases.length})</span>
      </button>

      {cases.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No cases</p>
      ) : (
        <div className="relative">
          <ul
            className="divide-y divide-border overflow-hidden transition-[max-height] duration-300 ease-in-out"
            style={{ maxHeight: !hasOverflow || expanded ? "2000px" : COLLAPSED_MAX_HEIGHT }}
          >
            {cases.map((caseItem) => (
              <CaseRow key={caseItem.id} caseItem={caseItem} />
            ))}
          </ul>
          {hasOverflow && (
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent transition-opacity duration-300 ${
                expanded ? "opacity-0" : "opacity-100"
              }`}
            />
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors. (Neither file is imported anywhere yet.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/dashboard/CaseRow.tsx apps/backend/components/app/dashboard/CaseGroup.tsx
git commit -m "Add CaseRow and CaseGroup (collapsible, fade-on-collapse) components"
```

---

### Task 7: `OpenCasesPanel` — three groups, replaces `RecentCasesList`

**Files:**
- Create: `apps/backend/components/app/dashboard/OpenCasesPanel.tsx`
- Delete: `apps/backend/components/app/dashboard/RecentCasesList.tsx`

**Interfaces:**
- Consumes: `CaseSummary` (Task 1), `CaseGroup` (Task 6).
- Produces: `OpenCasesPanel({ cases: CaseSummary[] })`, default export from `apps/backend/components/app/dashboard/OpenCasesPanel.tsx`. Consumed by Task 9's `page.tsx`.

`getRecentCases`/`getFollowUpCases`/`getEmailArrivedCases` are the three independent filters described in the spec — a case can appear in more than one group's output, since each filter runs independently over the same `cases` array.

- [ ] **Step 1: Create `OpenCasesPanel`**

Create `apps/backend/components/app/dashboard/OpenCasesPanel.tsx`:

```tsx
import type { CaseSummary } from "../../../lib/dashboard/types";
import CaseGroup from "@/components/app/dashboard/CaseGroup";

type OpenCasesPanelProps = {
  cases: CaseSummary[];
};

const MAX_RECENT_CASES = 5;

function getRecentCases(cases: CaseSummary[]): CaseSummary[] {
  return [...cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_RECENT_CASES);
}

function getFollowUpCases(cases: CaseSummary[]): CaseSummary[] {
  const now = new Date();
  return cases.filter((c) => c.dueDate && new Date(c.dueDate) < now);
}

function getEmailArrivedCases(cases: CaseSummary[]): CaseSummary[] {
  return cases.filter((c) => c.hasPendingEmail);
}

export default function OpenCasesPanel({ cases }: OpenCasesPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Open cases</h2>
      </div>
      <div className="divide-y divide-border">
        <CaseGroup title="Recent cases" cases={getRecentCases(cases)} />
        <CaseGroup title="Follow up" cases={getFollowUpCases(cases)} />
        <CaseGroup title="Email arrived" cases={getEmailArrivedCases(cases)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete `RecentCasesList.tsx`**

```bash
git rm apps/backend/components/app/dashboard/RecentCasesList.tsx
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors, and no "file not found" errors from the deletion — nothing imports `RecentCasesList` yet at this point in the plan (Task 9 removes `page.tsx`'s import of it).

Note: if `tsc` complains that `page.tsx` still imports the deleted `RecentCasesList`, that's expected until Task 9 — this task's own new/changed files (`OpenCasesPanel.tsx` and the deletion) are what must be clean; `page.tsx`'s pre-existing import breaking is resolved by Task 9, not this one. Confirm the error (if any) is scoped to `page.tsx`'s import line and not `OpenCasesPanel.tsx` itself.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/dashboard/OpenCasesPanel.tsx
git commit -m "Add OpenCasesPanel with Recent/Follow up/Email arrived groups, remove RecentCasesList"
```

---

### Task 8: Colorized notifications + `NotificationBell`

**Files:**
- Modify: `apps/backend/components/app/dashboard/NotificationsPanel.tsx` (full file, currently 46 lines)
- Create: `apps/backend/components/app/dashboard/NotificationBell.tsx`

**Interfaces:**
- Consumes: `NotificationItem` (existing, unchanged), `formatDashboardTimestamp` (existing, unchanged).
- Produces: `NotificationsPanel({ notifications: NotificationItem[] })` — same signature as before, only its internal per-item icon styling changes.
- Produces: `NotificationBell({ notifications: NotificationItem[] })`, default export from `apps/backend/components/app/dashboard/NotificationBell.tsx`. Consumed by Task 9's `layout.tsx`.

`NotificationBell` reuses `NotificationsPanel` directly as its dropup body (no duplicated list-rendering) and reuses the same click-outside-to-close `ref`/`mousedown` pattern already established in `MainTopBarUser.tsx`.

- [ ] **Step 1: Recolor `NotificationsPanel`'s icons**

Replace the full contents of `apps/backend/components/app/dashboard/NotificationsPanel.tsx`:

```tsx
import { Bell, Briefcase, FileText, Mail, type LucideIcon } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";
import { formatDashboardTimestamp } from "../../../lib/dashboard/formatDate";

const TYPE_ICONS: Record<NotificationItem["type"], LucideIcon> = {
  email: Mail,
  document: FileText,
  case: Briefcase,
  system: Bell,
};

const TYPE_ICON_STYLES: Record<NotificationItem["type"], string> = {
  email: "bg-blue-100 text-blue-600",
  document: "bg-purple-100 text-purple-600",
  case: "bg-emerald-100 text-emerald-700",
  system: "bg-amber-100 text-amber-700",
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
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TYPE_ICON_STYLES[n.type]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDashboardTimestamp(n.timestamp)}
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

- [ ] **Step 2: Create `NotificationBell`**

Create `apps/backend/components/app/dashboard/NotificationBell.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";
import NotificationsPanel from "@/components/app/dashboard/NotificationsPanel";

type NotificationBellProps = {
  notifications: NotificationItem[];
};

export default function NotificationBell({ notifications }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const unreadCount = notifications.length;

  return (
    <div className="fixed bottom-6 right-6 z-50" ref={containerRef}>
      {open && (
        <div className="absolute bottom-full right-0 mb-3 w-80">
          <NotificationsPanel notifications={notifications} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:border-foreground/30 transition-all cursor-pointer"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/dashboard/NotificationsPanel.tsx apps/backend/components/app/dashboard/NotificationBell.tsx
git commit -m "Color-code notification icons by type, add floating NotificationBell dropup"
```

---

### Task 9: Integration — `layout.tsx`, `page.tsx`, single-row stat tiles

**Files:**
- Modify: `apps/backend/app/app/layout.tsx` (full file, currently 24 lines)
- Modify: `apps/backend/app/app/page.tsx` (full file, currently 41 lines)
- Modify: `apps/backend/components/app/dashboard/StatTilesGrid.tsx` (full file, currently 16 lines)

**Interfaces:**
- Consumes: `AppTopBar` with `workspaceLabel` (Task 5), `NotificationBell` (Task 8), `OpenCasesPanel` (Task 7), `StatTilesGrid` (this task), `mockCases`/`mockStatTiles`/`mockNotifications` (Task 1).
- Produces: the final rendered `/app` route. Nothing downstream depends on this file's shape — it's the top of the tree.

The firm-name lookup moves from `page.tsx` into `layout.tsx` (since the topbar that displays it is owned by the layout), and `layout.tsx` also renders `NotificationBell` so it persists across `/app` and the 5 new coming-soon routes. `page.tsx` keeps its own `auth()` call, now only to read the user's name for the "Welcome `<name>`" greeting — a second `auth()` call per render, same already-accepted pattern noted in the original plan.

- [ ] **Step 1: Move the firm lookup into `layout.tsx`, render `NotificationBell`**

Replace the full contents of `apps/backend/app/app/layout.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";
import { mockNotifications } from "../../lib/dashboard/mockData";
import AppTopBar from "@/components/app/AppTopBar";
import NotificationBell from "@/components/app/dashboard/NotificationBell";

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
  const firmId = (session.user as { firmId?: string | null }).firmId ?? null;

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
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <AppTopBar userName={userName} tier={tier} workspaceLabel={workspaceLabel} />
      <main className="flex-grow w-full">{children}</main>
      <NotificationBell notifications={mockNotifications} />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `page.tsx`**

Replace the full contents of `apps/backend/app/app/page.tsx`:

```tsx
import { auth } from "../../auth";
import { mockCases, mockStatTiles } from "../../lib/dashboard/mockData";
import OpenCasesPanel from "@/components/app/dashboard/OpenCasesPanel";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";

export default async function AppHomePage() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "there";

  return (
    <div className="px-6 py-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome {userName}</h1>

      <div className="mt-8 flex flex-col gap-6">
        <StatTilesGrid tiles={mockStatTiles} />
        <OpenCasesPanel cases={mockCases} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Change stat tiles to a single row**

Replace the full contents of `apps/backend/components/app/dashboard/StatTilesGrid.tsx`:

```tsx
import type { StatTileData } from "../../../lib/dashboard/types";
import StatTile from "@/components/app/dashboard/StatTile";

type StatTilesGridProps = {
  tiles: StatTileData[];
};

export default function StatTilesGrid({ tiles }: StatTilesGridProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <StatTile key={tile.id} tile={tile} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: clean — this is the task that resolves the `RecentCasesList` import Task 7 removed.

- [ ] **Step 5: Manual check**

With the dev server running, log in and visit `/app`:
- Topbar shows the logo, the 5-item pill nav (Cases/Tasks/Calendar/Billing/Documents — visible at desktop width, hidden below `md`), and the user menu with the name/tier on one line and the workspace label as a second, smaller line beneath it.
- Clicking each of the 5 nav items navigates to its route and shows "`<Feature>` is coming soon", still inside the topbar/shell.
- Page heading reads "Welcome `<your name>`" (no "back", no separate workspace-label line).
- Below it, one row of 4 stat tiles, then the "Open cases" panel with three groups — Recent cases, Follow up, Email arrived — each showing a count, 3 rows by default with a bottom fade if more exist, and expanding/collapsing (with the chevron flipping between `>` and `v`) on click. Confirm `case-9` ("רישוי עסק חדש") appears in both Follow up and Email arrived.
- Page content is no longer centered — it hugs the left edge of the viewport.
- A circular bell button floats at the bottom-right of the screen with a badge showing "4"; clicking it opens a card upward with all 4 notifications, each with a distinctly colored icon background (blue/purple/green/amber); clicking outside closes it.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/app/layout.tsx apps/backend/app/app/page.tsx apps/backend/components/app/dashboard/StatTilesGrid.tsx
git commit -m "Wire revised dashboard: relocated greeting/workspace label, single-row tiles, Open Cases panel, notification bell"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full build**

Run: `pnpm --filter backend build`
Expected: succeeds, including the 5 new `/app/*` routes.

- [ ] **Step 3: Full backend test suite (regression check)**

Run: `pnpm --filter backend test`
Expected: all existing tests still pass (132 before this plan) — this plan added no `.test.ts` files.

- [ ] **Step 4: Manual walkthrough against the spec**

With the dev server running, logged in:
1. Repeat Task 9 Step 5's checks in full.
2. Visit a marketing page (e.g. `/pricing`) and confirm the topbar is visually and behaviorally unchanged from before this plan (Task 4's constraint).
3. Resize the browser below `768px` (the `md` breakpoint) on `/app` and confirm the pill nav disappears cleanly (logo and user menu remain).
4. Confirm a group with 3 or fewer cases (if any occur with the current mock data) renders without a chevron or fade — not applicable today since all three groups have 5 entries, but re-check this if the mock data ever changes.

- [ ] **Step 5: Commit (if any fixups were needed)**

Only if Step 4 surfaced an issue requiring a code change — otherwise this task produces no commit of its own; it's a verification gate on the nine commits already made.

## Spec coverage check

- Shared `TopBarShell` base, marketing topbar unchanged, dashboard gets `AppNavMenu` — Tasks 2, 4, 5.
- 5 coming-soon routes matching the nav menu's hrefs — Task 3.
- Firm name moved from greeting to a second line under the user's name; greeting becomes "Welcome `<name>`" — Task 9 (layout.tsx + page.tsx), building on Task 4's `workspaceLabel` prop.
- Stat tiles single row, page left-aligned/full-width — Task 9 (StatTilesGrid + page.tsx).
- Open Cases as three independent, overlapping-allowed collapsible groups with fade + chevron swap — Tasks 1 (data), 6 (CaseRow/CaseGroup), 7 (OpenCasesPanel).
- Notification bell + color-coded dropup, persistent across `/app/*` — Task 8 (NotificationBell + recolored NotificationsPanel), rendered in Task 9's layout.tsx.
- Edge cases from the spec (≤3-item group has no chevron/toggle, future `dueDate` doesn't count as overdue, 0-count bell has no badge, nav menu hidden below `md`) — covered in Task 6 (`CaseGroup`'s `hasOverflow` branch), Task 7 (`getFollowUpCases`'s strict `< now` check), Task 8 (`unreadCount > 0` guard), Task 2 (`hidden md:flex`).
