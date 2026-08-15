# Dashboard glance cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new glanceable cards — Important Tasks, Emails Arrived, Billing & Finance — filling the empty space beside Open Activities on the `/app` dashboard, sharing a color-coded "status rail" signature and a common card shell.

**Architecture:** Two new shared presentational components (`DashboardCard`, `StatusRail`) back three new domain cards, each a server component consuming a new mocked data shape from `lib/dashboard/`. `app/app/page.tsx` is restructured from a single column to a two-region row: Open Activities (unchanged, fixed width) on the left, the three new cards in a responsive grid on the right.

**Tech Stack:** Same as the rest of `apps/backend` — Next.js 15 App Router server components, Tailwind v4 with the shared shadcn CSS-variable token theme, `lucide-react` (already a dependency), the `font-heading` (Rubik) Tailwind utility already wired up in `app/globals.css`/`app/layout.tsx`.

## Global Constraints

- **No new dependencies.**
- **Import convention, unchanged from every prior task in this dashboard:** `lib/dashboard/*` is imported with a relative path from `components/app/dashboard/*.tsx` (three levels up: `../../../lib/dashboard/...`). Component-to-component imports use the `@/components/*` alias.
- **No unit tests.** Matches the rest of this dashboard: `vitest.config.ts` only globs `**/*.test.ts`, no component-test convention exists, and this is presentational/mocked content. Verification is `tsc --noEmit`, `next build`, and a manual browser walkthrough.
- **Card shell styling must match Open Activities' existing floating-card treatment exactly**: `rounded-2xl bg-card shadow-2xl` (from `components/app/dashboard/OpenCasesPanel.tsx`).
- **Headings use the existing `font-heading` Tailwind utility** (maps to the Rubik variable font already loaded in `app/layout.tsx` / `app/globals.css` — do not re-import or reconfigure the font).
- **Status rail colors are a fixed 5-color vocabulary** — `emerald` (done/paid/matched), `amber` (due-today/needs-review/pending-invoice), `rose` (overdue), `slate` (upcoming/neutral), `blue` (matched-email) — reused consistently across all three cards per the spec; do not invent additional colors.
- **Currency is ILS, formatted as `formatILS(amount)` → `"₪23,150"`** (₪ prefix, thousands-separated, no decimals) — a new one-function file, matching the existing one-function-per-file pattern in `lib/dashboard/formatDate.ts`.
- **No actions, no "view all" links** — every card is a fixed, small, read-only mock list per the spec's Non-goals.

---

### Task 1: Data layer — new types, mock data, currency formatter

**Files:**
- Modify: `apps/backend/lib/dashboard/types.ts` (full file, currently 28 lines — only appending, do not remove or restructure existing exports)
- Modify: `apps/backend/lib/dashboard/mockData.ts` (full file, currently 37 lines — only appending, do not restructure existing exports)
- Create: `apps/backend/lib/dashboard/formatCurrency.ts`

**Interfaces:**
- Produces: `TaskUrgency`, `ImportantTask`, `EmailMatchStatus`, `EmailArrival`, `BillingCaseProgress`, `BillingSummary` types, appended to `apps/backend/lib/dashboard/types.ts`.
- Produces: `mockImportantTasks: ImportantTask[]` (3 entries), `mockEmailArrivals: EmailArrival[]` (3 entries), `mockBillingSummary: BillingSummary` (1 object, 3 cases), appended to `apps/backend/lib/dashboard/mockData.ts`. Consumed by Tasks 3–6.
- Produces: `formatILS(amount: number): string`, exported from `apps/backend/lib/dashboard/formatCurrency.ts`. Consumed by Task 5.

Existing types/mock data in both files (`CaseStatus`, `CaseSummary`, `StatTileIcon`, `StatTileData`, `NotificationItem`, `mockCases`, `mockStatTiles`, `mockNotifications`) are untouched — this task only appends.

- [ ] **Step 1: Append the new types**

Add to the end of `apps/backend/lib/dashboard/types.ts` (after the existing `NotificationItem` interface):

```ts

export type TaskUrgency = "overdue" | "due-today" | "upcoming";

export interface ImportantTask {
  id: string;
  title: string;
  caseSubject: string;
  dueAt: string; // ISO datetime
  urgency: TaskUrgency; // overdue -> rose rail, due-today -> amber, upcoming -> slate
}

export type EmailMatchStatus = "matched" | "needs-review";

export interface EmailArrival {
  id: string;
  sender: string;
  subject: string;
  matchedCaseSubject?: string; // present only when matchStatus is "matched"
  receivedAt: string; // ISO datetime
  matchStatus: EmailMatchStatus; // matched -> blue rail, needs-review -> amber rail
}

export interface BillingCaseProgress {
  id: string;
  caseSubject: string;
  paidAmount: number; // ILS
  totalAmount: number; // ILS
  isOverdue: boolean; // true -> rose progress fill, false -> emerald
}

export interface BillingSummary {
  outstandingAmount: number; // ILS
  collectedThisMonth: number; // ILS
  cases: BillingCaseProgress[];
  pendingInvoiceLabel: string; // e.g. "Invoice #2026-0142 · pending payment"
}
```

- [ ] **Step 2: Append the new mock data**

Add to the end of `apps/backend/lib/dashboard/mockData.ts` (after the existing `mockNotifications` array), and add `ImportantTask, EmailArrival, BillingSummary` to the existing `import type { ... } from "./types"` line at the top of the file:

```ts

// First entry is the "spotlight" item each card highlights; the rest render
// as plain status-rail rows. No sorting logic -- fixed mock order.
export const mockImportantTasks: ImportantTask[] = [
  { id: "task-1", title: "File response to plaintiff's motion", caseSubject: "תביעה בגין רשלנות", dueAt: "2026-08-11T17:00:00Z", urgency: "overdue" },
  { id: "task-2", title: "Prepare witness list", caseSubject: "בדיקת ניהול משימות", dueAt: "2026-08-12T14:00:00Z", urgency: "due-today" },
  { id: "task-3", title: "Client intake call", caseSubject: "Contract Review — Acme Corp", dueAt: "2026-08-13T10:00:00Z", urgency: "upcoming" },
];

export const mockEmailArrivals: EmailArrival[] = [
  { id: "email-1", sender: "Tel Aviv District Court Clerk", subject: "Hearing rescheduled", matchedCaseSubject: "תביעה בגין רשלנות", receivedAt: "2026-08-12T09:30:00Z", matchStatus: "matched" },
  { id: "email-2", sender: "צמח מזרחי", subject: "מסמכים נוספים לתיק", matchedCaseSubject: "בדיקת ניהול משימות", receivedAt: "2026-08-12T08:10:00Z", matchStatus: "matched" },
  { id: "email-3", sender: "unknown@lawfirm-partner.com", subject: "Re: settlement terms", receivedAt: "2026-08-11T16:45:00Z", matchStatus: "needs-review" },
];

export const mockBillingSummary: BillingSummary = {
  outstandingAmount: 23150,
  collectedThisMonth: 86400,
  cases: [
    { id: "billing-1", caseSubject: "אברמוב נ' שלו", paidAmount: 12000, totalAmount: 18000, isOverdue: false },
    { id: "billing-2", caseSubject: "עיזבון המנוח לוי", paidAmount: 9500, totalAmount: 9500, isOverdue: false },
    { id: "billing-3", caseSubject: "חב' גל נ' מזרחי", paidAmount: 4000, totalAmount: 12650, isOverdue: true },
  ],
  pendingInvoiceLabel: "Invoice #2026-0142 · pending payment",
};
```

- [ ] **Step 3: Create the currency formatter**

Create `apps/backend/lib/dashboard/formatCurrency.ts`:

```ts
export function formatILS(amount: number): string {
  return `₪${amount.toLocaleString("en-US")}`;
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/lib/dashboard/types.ts apps/backend/lib/dashboard/mockData.ts apps/backend/lib/dashboard/formatCurrency.ts
git commit -m "Add data layer for dashboard glance cards (tasks, emails, billing)"
```

---

### Task 2: Shared `DashboardCard` + `StatusRail`

**Files:**
- Create: `apps/backend/components/app/dashboard/DashboardCard.tsx`
- Create: `apps/backend/components/app/dashboard/StatusRail.tsx`

**Interfaces:**
- Produces: `DashboardCard({ icon: LucideIcon; title: string; count?: number; children: ReactNode })`, default export from `apps/backend/components/app/dashboard/DashboardCard.tsx`. Consumed by Tasks 3, 4, 5.
- Produces: `StatusRail({ color: "emerald" | "amber" | "rose" | "slate" | "blue"; children: ReactNode })`, default export from `apps/backend/components/app/dashboard/StatusRail.tsx`. Consumed by Tasks 3, 4.

Neither file is imported anywhere yet — both are standalone, verified only by type-check in this task.

- [ ] **Step 1: Create `DashboardCard`**

Create `apps/backend/components/app/dashboard/DashboardCard.tsx`:

```tsx
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type DashboardCardProps = {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
};

export default function DashboardCard({ icon: Icon, title, count, children }: DashboardCardProps) {
  return (
    <div className="rounded-2xl bg-card shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
        {typeof count === "number" && (
          <span className="ml-auto text-xs font-medium text-muted-foreground">{count}</span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `StatusRail`**

Create `apps/backend/components/app/dashboard/StatusRail.tsx`:

```tsx
import type { ReactNode } from "react";

type RailColor = "emerald" | "amber" | "rose" | "slate" | "blue";

const RAIL_COLOR_CLASSES: Record<RailColor, string> = {
  emerald: "border-emerald-500",
  amber: "border-amber-500",
  rose: "border-rose-500",
  slate: "border-slate-300",
  blue: "border-blue-500",
};

type StatusRailProps = {
  color: RailColor;
  children: ReactNode;
};

export default function StatusRail({ color, children }: StatusRailProps) {
  return <div className={`border-l-4 pl-3 ${RAIL_COLOR_CLASSES[color]}`}>{children}</div>;
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/components/app/dashboard/DashboardCard.tsx apps/backend/components/app/dashboard/StatusRail.tsx
git commit -m "Add shared DashboardCard shell and StatusRail row components"
```

---

### Task 3: `ImportantTasksCard`

**Files:**
- Create: `apps/backend/components/app/dashboard/ImportantTasksCard.tsx`

**Interfaces:**
- Consumes: `ImportantTask`, `TaskUrgency` (Task 1), `formatDashboardTimestamp` (existing, unchanged), `DashboardCard`, `StatusRail` (Task 2).
- Produces: `ImportantTasksCard({ tasks: ImportantTask[] })`, default export. Consumed by Task 6's `page.tsx`.

- [ ] **Step 1: Create `ImportantTasksCard`**

Create `apps/backend/components/app/dashboard/ImportantTasksCard.tsx`:

```tsx
import { ListChecks } from "lucide-react";
import type { ImportantTask, TaskUrgency } from "../../../lib/dashboard/types";
import { formatDashboardTimestamp } from "../../../lib/dashboard/formatDate";
import DashboardCard from "@/components/app/dashboard/DashboardCard";
import StatusRail from "@/components/app/dashboard/StatusRail";

const URGENCY_RAIL_COLOR: Record<TaskUrgency, "rose" | "amber" | "slate"> = {
  overdue: "rose",
  "due-today": "amber",
  upcoming: "slate",
};

type ImportantTasksCardProps = {
  tasks: ImportantTask[];
};

export default function ImportantTasksCard({ tasks }: ImportantTasksCardProps) {
  const [spotlight, ...rest] = tasks;

  return (
    <DashboardCard icon={ListChecks} title="Important Tasks" count={tasks.length}>
      {spotlight && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Next up</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{spotlight.title}</p>
          <p className="truncate text-xs text-muted-foreground">{spotlight.caseSubject}</p>
          <p className="mt-1 text-xs text-indigo-700">{formatDashboardTimestamp(spotlight.dueAt)}</p>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rest.map((task) => (
            <li key={task.id}>
              <StatusRail color={URGENCY_RAIL_COLOR[task.urgency]}>
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="truncate text-xs text-muted-foreground">{task.caseSubject}</p>
                <p className="text-xs text-muted-foreground">{formatDashboardTimestamp(task.dueAt)}</p>
              </StatusRail>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/components/app/dashboard/ImportantTasksCard.tsx
git commit -m "Add ImportantTasksCard"
```

---

### Task 4: `EmailsArrivedCard`

**Files:**
- Create: `apps/backend/components/app/dashboard/EmailsArrivedCard.tsx`

**Interfaces:**
- Consumes: `EmailArrival` (Task 1), `DashboardCard`, `StatusRail` (Task 2).
- Produces: `EmailsArrivedCard({ emails: EmailArrival[] })`, default export. Consumed by Task 6's `page.tsx`.

- [ ] **Step 1: Create `EmailsArrivedCard`**

Create `apps/backend/components/app/dashboard/EmailsArrivedCard.tsx`:

```tsx
import { Mail } from "lucide-react";
import type { EmailArrival } from "../../../lib/dashboard/types";
import DashboardCard from "@/components/app/dashboard/DashboardCard";
import StatusRail from "@/components/app/dashboard/StatusRail";

type EmailsArrivedCardProps = {
  emails: EmailArrival[];
};

export default function EmailsArrivedCard({ emails }: EmailsArrivedCardProps) {
  const [spotlight, ...rest] = emails;

  return (
    <DashboardCard icon={Mail} title="Emails Arrived" count={emails.length}>
      {spotlight && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Next up</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{spotlight.subject}</p>
          <p className="truncate text-xs text-muted-foreground">{spotlight.sender}</p>
          <p className="mt-1 text-xs text-indigo-700">
            {spotlight.matchStatus === "matched" ? spotlight.matchedCaseSubject : "Needs review"}
          </p>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rest.map((email) => (
            <li key={email.id}>
              <StatusRail color={email.matchStatus === "matched" ? "blue" : "amber"}>
                <p className="truncate text-sm font-medium text-foreground">{email.subject}</p>
                <p className="truncate text-xs text-muted-foreground">{email.sender}</p>
                <p className="text-xs text-muted-foreground">
                  {email.matchStatus === "matched" ? email.matchedCaseSubject : "Needs review"}
                </p>
              </StatusRail>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/components/app/dashboard/EmailsArrivedCard.tsx
git commit -m "Add EmailsArrivedCard"
```

---

### Task 5: `BillingFinanceCard`

**Files:**
- Create: `apps/backend/components/app/dashboard/BillingFinanceCard.tsx`

**Interfaces:**
- Consumes: `BillingSummary` (Task 1), `formatILS` (Task 1), `DashboardCard` (Task 2). Does NOT use `StatusRail` — per the spec, Billing's per-case rows use a progress-bar fill, not a rail.
- Produces: `BillingFinanceCard({ billing: BillingSummary })`, default export. Consumed by Task 6's `page.tsx`.

- [ ] **Step 1: Create `BillingFinanceCard`**

Create `apps/backend/components/app/dashboard/BillingFinanceCard.tsx`:

```tsx
import { Wallet } from "lucide-react";
import type { BillingSummary } from "../../../lib/dashboard/types";
import { formatILS } from "../../../lib/dashboard/formatCurrency";
import DashboardCard from "@/components/app/dashboard/DashboardCard";

type BillingFinanceCardProps = {
  billing: BillingSummary;
};

export default function BillingFinanceCard({ billing }: BillingFinanceCardProps) {
  return (
    <DashboardCard icon={Wallet} title="Billing & Finance">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatILS(billing.outstandingAmount)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Collected this month</p>
          <p className="mt-1 text-xl font-bold text-emerald-600">{formatILS(billing.collectedThisMonth)}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {billing.cases.map((c) => {
          const percentPaid = Math.min(100, (c.paidAmount / c.totalAmount) * 100);
          return (
            <li key={c.id}>
              <p className="truncate text-sm font-medium text-foreground">{c.caseSubject}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${c.isOverdue ? "bg-rose-500" : "bg-emerald-500"}`}
                  style={{ width: `${percentPaid}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatILS(c.paidAmount)} of {formatILS(c.totalAmount)}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {billing.pendingInvoiceLabel}
        </span>
      </div>
    </DashboardCard>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/components/app/dashboard/BillingFinanceCard.tsx
git commit -m "Add BillingFinanceCard"
```

---

### Task 6: Integration — wire the three cards into `/app`

**Files:**
- Modify: `apps/backend/app/app/page.tsx` (full file, currently 22 lines)

**Interfaces:**
- Consumes: `ImportantTasksCard` (Task 3), `EmailsArrivedCard` (Task 4), `BillingFinanceCard` (Task 5), `mockImportantTasks`/`mockEmailArrivals`/`mockBillingSummary` (Task 1). `OpenCasesPanel`/`StatTilesGrid`/`mockCases`/`mockStatTiles` are existing, unchanged.
- Produces: the final rendered `/app` route. Nothing downstream depends on this file's shape.

Restructures the body below the stat tiles from a single `OpenCasesPanel` into a responsive row: `OpenCasesPanel` (unchanged, keeps its own fixed `max-w-sm`) on the left, the three new cards in a `grid grid-cols-1 md:grid-cols-3 gap-6` region on the right, both wrapped in a `flex flex-col lg:flex-row gap-6 items-start` container that collapses to one stacked column below `lg`.

- [ ] **Step 1: Rewrite `page.tsx`**

Replace the full contents of `apps/backend/app/app/page.tsx`:

```tsx
import { auth } from "../../auth";
import {
  mockBillingSummary,
  mockCases,
  mockEmailArrivals,
  mockImportantTasks,
  mockStatTiles,
} from "../../lib/dashboard/mockData";
import OpenCasesPanel from "@/components/app/dashboard/OpenCasesPanel";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";
import ImportantTasksCard from "@/components/app/dashboard/ImportantTasksCard";
import EmailsArrivedCard from "@/components/app/dashboard/EmailsArrivedCard";
import BillingFinanceCard from "@/components/app/dashboard/BillingFinanceCard";

export default async function AppHomePage() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "there";

  return (
    <div className="px-6 pt-2 pb-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome {userName}</h1>

      <div className="mt-6 flex flex-col">
        <StatTilesGrid tiles={mockStatTiles} />
        <div className="mt-10 flex flex-col lg:flex-row gap-6 items-start">
          <OpenCasesPanel cases={mockCases} />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
            <ImportantTasksCard tasks={mockImportantTasks} />
            <EmailsArrivedCard emails={mockEmailArrivals} />
            <BillingFinanceCard billing={mockBillingSummary} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual check**

With the dev server running, log in and visit `/app`:
- Open Activities keeps its existing fixed width on the left; the three new cards fill the right side in one row at desktop width.
- **Important Tasks**: indigo spotlight box shows "File response to plaintiff's motion" (overdue task); below it, 2 status-rail rows — "Prepare witness list" with an amber left border, "Client intake call" with a slate left border.
- **Emails Arrived**: indigo spotlight box shows the court-clerk email matched to "תביעה בגין רשלנות"; below it, one blue-rail matched row and one amber-rail "Needs review" row (unmatched sender).
- **Billing & Finance**: "Outstanding ₪23,150" and "Collected this month ₪86,400" (green) side by side; three case rows with progress bars — two emerald (one nearly full, one 100% full), one rose (the overdue case); an amber "Invoice #2026-0142 · pending payment" chip at the bottom.
- Resize below `lg` — the three-card grid and Open Activities stack into one column; resize further below `md` — the three cards stack to one column each within their region.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/app/page.tsx
git commit -m "Wire Important Tasks, Emails Arrived, and Billing & Finance cards into /app"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `pnpm --filter backend exec tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full build**

Run: `pnpm --filter backend build`
Expected: succeeds with no new warnings.

- [ ] **Step 3: Full backend test suite (regression check)**

Run: `pnpm --filter backend test`
Expected: all existing tests still pass (132 before this plan) — this plan added no `.test.ts` files.

- [ ] **Step 4: Manual walkthrough against the spec**

Repeat Task 6 Step 3's checks in full, plus:
1. Confirm no card has any clickable action, "view all" link, or dead button (spec's Non-goals).
2. Confirm long Hebrew/English text truncates cleanly in all three cards rather than wrapping or overflowing.
3. Confirm the page background gradient and Open Activities' own floating shadow are visually unaffected by the new cards (purely additive).

- [ ] **Step 5: Commit (if any fixups were needed)**

Only if Step 4 surfaced an issue requiring a code change — otherwise this task produces no commit of its own; it's a verification gate on the six commits already made.

## Spec coverage check

- Status-rail signature (emerald/amber/rose/slate/blue left border) — Task 2 (`StatusRail`), used by Tasks 3 and 4.
- Shared `DashboardCard` shell (floating-card treatment, icon + Rubik title + count) — Task 2, used by Tasks 3, 4, 5.
- Spotlight pattern (indigo box, "Next up" eyebrow) for Tasks and Emails, absent from Billing — Tasks 3, 4, 5.
- Billing's progress-bar fill (not a rail) — Task 5.
- Data shapes and mock content (`ImportantTask`, `EmailArrival`, `BillingSummary`) — Task 1.
- `formatILS` currency formatting — Task 1, used by Task 5.
- Layout restructure (Open Activities + 3-card grid, responsive stacking) — Task 6.
- Edge cases from the spec: progress bar clamped to 100% (Task 5's `Math.min`), truncated text throughout (Tasks 3–5), no unit tests anywhere — all covered.
- Non-goals respected: no actions, no "view all" links, no real data — none of these appear anywhere in Tasks 1–6.
