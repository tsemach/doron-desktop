# Dashboard glance cards — design

**Linear issue:** [ASC-155](https://linear.app/amicusx/issue/ASC-155/openingdashboard-page-follow-up-enhancements) — "Opening/dashboard page — follow-up enhancements" (sub-project 2.5 of [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend))
**Status:** Sub-project 2.5 (see [ASC-105 roadmap](2026-08-10-asc-105-roadmap.md))
**Date:** 2026-08-12

## Background

The `/app` dashboard (sub-project 2, PR #159) has a wide, mostly-empty right side next to the narrow "Open Activities" panel — every screenshot taken during that PR's review rounds shows it. This adds three new cards to fill it: **Important Tasks**, **Emails Arrived**, and **Billing & Finance** — each a compact, glanceable summary of "what needs my attention right now" in its domain, explicitly modeled on two reference UIs the user supplied (a Hebrew billing/collections card with stat pairs + progress bars, and a case-detail card with a highlighted "next hearing" box + a step timeline).

The brief was explicit that this needs to be **visually distinctive and immediately scannable** ("understand in a blink of an eye"), not a generic three-box dashboard filler.

## Goals

- Fill the empty space to the right of Open Activities with three cards, each surfacing a handful of the most important items in its domain, not an exhaustive list.
- Give the three cards one shared, ownable visual language (not three unrelated widgets bolted together), while keeping each card's content distinct to its domain.
- Everything is mocked, static data — no new API routes, no new DB queries, matching the rest of the dashboard's sub-project 2 constraint.

## Non-goals (explicitly deferred)

- No actions (marking a task done, dismissing an email match, paying an invoice) — these are read-only summaries, matching the rest of the dashboard's "no dead buttons" discipline.
- No "view all" links to pages that don't exist yet — each card shows a fixed, small set of mock items with no pagination or overflow affordance.
- No real task/email/billing data or backend integration — blocked on sub-project #3 (cases/documents data-ownership decision), same as the rest of this dashboard.

## Design

### Shared visual language

**Signature element — the status rail.** Every list row across all three cards carries a **thin colored left border** (`border-l-4`) instead of a generic bullet or icon-only status: emerald = done/paid/matched, amber = due today/needs review, rose = overdue/urgent, slate = upcoming/neutral. This is the one visual idea that ties the three cards together — a digitized version of color-coded case-folder tabs, chosen because it's scannable by color alone before reading any text, which directly serves the "blink of an eye" requirement. It deliberately is **not** implemented identically everywhere: Billing's per-case rows use the same color vocabulary as a **progress-bar fill**, not a rail, since "portion paid" is inherently a fill-amount concept, not a status-of-one-item concept — forcing one geometry everywhere would be templating the signature rather than applying its idea.

**Shared card shell.** All three (and reused by nothing else, to avoid speculative abstraction) share one `DashboardCard` component: `rounded-2xl bg-card shadow-2xl` (matching Open Activities' existing floating-card treatment), a header row (icon + Rubik-bold title + optional count), and a padded body slot. This is the exact duplication the final review of sub-project 2 flagged as worth extracting "when a third panel lands" — this is that moment.

**Spotlight pattern (Tasks and Emails only).** The single most urgent item in each of these two cards renders in a highlighted box — `rounded-xl border border-indigo-200 bg-indigo-50` — with an eyebrow label ("Next up"), rather than in the plain row list below it. Indigo was chosen deliberately to tie back to the page's own background gradient (`from-white via-slate-50 to-indigo-50`, added earlier this sub-project), so the one "look here first" element on the page echoes the page's own palette rather than introducing an unrelated accent. Billing has no spotlight box — its reference UI leads with paired stats instead, which is the stronger fit for financial data.

### Data shapes (`lib/dashboard/types.ts`)

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

The first entry in `mockImportantTasks` and `mockEmailArrivals` (by array order — no sorting logic needed for 3 mocked items) is the one rendered in the spotlight box; the rest render as rail rows below it. Mirrors the "Recent cases" pattern of not over-engineering selection logic for a fixed, small mock set.

### Components (`components/app/dashboard/`)

- **`DashboardCard.tsx`** — shared shell described above. Props: `{ icon: LucideIcon; title: string; count?: number; children: ReactNode }`.
- **`StatusRail.tsx`** — one row with a colored left border. Props: `{ color: "emerald" | "amber" | "rose" | "slate" | "blue"; children: ReactNode }`.
- **`ImportantTasksCard.tsx`** — `DashboardCard` (icon `ListChecks`, title "Important Tasks", count = task count) containing the spotlight box for the first mock task, then `StatusRail` rows for the rest (title, case name, due time).
- **`EmailsArrivedCard.tsx`** — `DashboardCard` (icon `Mail`, title "Emails Arrived", count = email count), same spotlight + rail structure; unmatched emails show an amber "Needs review" label instead of a matched-case name.
- **`BillingFinanceCard.tsx`** — `DashboardCard` (icon `Wallet`, title "Billing & Finance", no count). Body: two side-by-side stat blocks (Outstanding / Collected this month, in ₪), then one row per case with a thin progress bar (emerald or rose fill by `isOverdue`) and a "₪paid / ₪total" line, then one pending-invoice chip at the bottom (amber pill, matching the reference image's bottom chip).
- **`lib/dashboard/formatCurrency.ts`** — `formatILS(amount: number): string`, same one-function-per-file pattern as `formatDate.ts`.

### Layout (`app/app/page.tsx`)

Restructured from a single column to a responsive two-region row: Open Activities stays at its current fixed width on the left; the three new cards sit in a `grid grid-cols-1 md:grid-cols-3 gap-6` region filling the remaining width on the right, wrapped together in a `flex flex-col lg:flex-row gap-6 items-start` container so the whole row stacks to one column below `lg`.

## Edge cases

- A `StatusRail` row's colored border is purely presentational (`border-l-4`) — no `role`/`aria` semantics are attached to color alone; the row's own text (urgency isn't restated in words today, since none of the three cards currently need a screen-reader-only label for it — flagged here rather than silently skipped).
- Billing progress bar width is clamped to 100% even if `paidAmount` somehow exceeded `totalAmount` in a future data source (`Math.min(100, ...)`), though the mock data never does this.
- Long case/task/email subject text truncates (`truncate`) rather than wrapping, consistent with every other text line on this dashboard.

## Testing

Same approach as the rest of this dashboard: no unit tests for static/mocked presentational content (no component-test convention in this codebase). Verification is `tsc --noEmit`, `next build`, and a manual browser walkthrough confirming: all three cards render with correct spotlight/rail colors, the layout sits correctly next to Open Activities and stacks to one column below `lg`, and the extracted `DashboardCard`/`StatusRail` don't visually regress anything (there's nothing else using them yet, so this is purely additive).

## What this unblocks

`DashboardCard` and `StatusRail` are now available for any future dashboard card without re-deriving the shell each time. The three new data shapes (`ImportantTask`, `EmailArrival`, `BillingSummary`) establish what a future sub-project #3 real-data integration would need to populate — same "mock now, swap later" contract as the rest of this dashboard.
