# Calendar Support — Brainstorm

Companion to [`why-and-requirements.md`](./why-and-requirements.md). Records the approaches considered for each open decision and why the chosen option won, so the reasoning survives independent of the final design.

## 1. Feature scope: one shot vs. phased

**Options considered:**
- Design + plan the entire issue as one continuous, unphased build.
- Design + plan only a foundation slice (Google OAuth + sync + the Calendar tab's grid views), pushing case-linking, notifications, and case-detail integration to separate follow-up issues.
- Full design covering everything, but a **phased plan** breaking it into ordered, independently-reviewable PRs/sub-issues.

**Chosen: full design, phased plan.** The issue is comparable in size to [ASC-91](../task-management/plan.md) (task management), which became a 9-PR stack after review feedback that a single PR was unreviewable. A phased plan gets the same benefit — small diffs, working software after every merge — without fragmenting the design itself across multiple documents that would need to stay in sync.

## 2. Sync direction ("Google Calendar is the source of truth")

**Options considered:**
- **Write-through**: creating a meeting in-app calls Google's API synchronously, then the local table only ever mirrors what Google returns.
- **Local-first**: save locally immediately (works offline), push to Google on the next background sync tick — local and Google can briefly disagree.
- **Read-only**: Ascurix only displays what's on Google; in-app creation is descoped entirely.

**Chosen: write-through.** The issue explicitly states Google is authoritative; local-first would mean the app briefly *disagrees* with its own source of truth, which contradicts that framing and reintroduces exactly the reconciliation complexity the "source of truth" framing was meant to avoid. Read-only was rejected because R4 (create from the app) is an explicit requirement, not optional.

## 3. Google connection requirement

**Options considered:**
- **Required**: the Calendar tab shows a connect-Google prompt until authorized; no meetings exist without it.
- **Optional**: local-only meetings are allowed, Google sync layers on top once connected.

**Chosen: required.** Optional-Google means building conflict/merge logic for meetings that predate a Google connection — logic this feature doesn't otherwise need, and that fights "Google is the source of truth" the same way local-first sync would (§2).

## 4. Case-link matching strategy (R5)

**Options considered:**
- **Reuse the email matcher's confidence tiers** (`match_email_core`'s Tier A/B/C) — high confidence auto-links, low/ambiguous confidence lands in an "unmatched" review lane, same concept as unmatched emails.
- **Exact/near-exact normalized match only** — no tiers, no fuzzy scoring; anything that doesn't match closely stays unlinked.
- **Always prompt** — any detected phrase opens a confirm-the-case picker pre-filled with a best guess; never auto-links silently.

**Chosen: exact/near-exact only.** Reusing the full matcher pulls in FTS content-similarity and `strsim` fuzzy party-name matching (`case_matcher/tier_c.rs`) that were tuned against *email* signal density (subject + body + attachments) — a one-line calendar description doesn't carry equivalent signal, so those tiers would mostly return low-confidence noise. Near-exact keeps the implementation small (reuses only `normalize_for_match`, not the full matcher pipeline) and predictable: either the phrase clearly names a case, or the user links it manually. Always-prompt was rejected as friction for the common case where the phrase is unambiguous.

## 5. Task attachment (R5, second half)

**Options considered:**
- **Manual picker only**: the case/task phrase syntax stays case-only; attaching to a specific task is a dropdown in the meeting form once a case is attached.
- **Extend the phrase syntax to tasks too** (e.g. a `"task: <title>"` / `"משימה: <title>"` line).

**Outcome: dropped entirely.** Neither option was pursued — once the phrase-syntax question for tasks came up, the task-attachment half of R5 was removed from the issue's scope rather than designed. See [`why-and-requirements.md`](./why-and-requirements.md) R5.

## 6. Notification mechanism (R6)

**Options considered:**
- **OS-level** (`tauri-plugin-notification`): real OS notification, visible even minimized/backgrounded; needs a new OS permission prompt.
- **In-app banner only** (new component mirroring `UpdateBanner.tsx`): no OS permission, but silent unless the Ascurix window is open and visible.
- **Both.**

**Chosen: OS-level only.** The point of a pre-meeting reminder is to reach someone who isn't necessarily looking at Ascurix at that moment — an in-app-only banner defeats that purpose for the most common case (app minimized during a meeting-heavy day). "Both" was rejected as unnecessary surface area for this round; nothing rules out adding an in-app banner later if OS notifications prove insufficient.

## 7. Case details: meetings UI (R7 / R8)

**Options considered:**
- **Icon opens a modal** (mirrors the existing annotations-modal pattern) showing all of a case's meetings as boxes; overview gets a separate small preview card linking to that modal.
- **Single unified panel, no modal**: a calendar-icon entry point switches the case-detail right pane to a dedicated meetings view — the same mechanism `activeRightTab` already uses for Overview/Emails/Tasks — while the overview panel still gets its own small preview card.

**Chosen: single unified panel, no modal** — explicit correction after the first framing (modal) was proposed: "in case details the Calendar icon will show the meetings in the details place like all documents preview, tasks and overview. not as modal window." This keeps the meetings view consistent with how every other case-detail surface already works (`CaseDetailTab` + `activeRightTab`), rather than introducing a second navigation pattern (modal) alongside the tab system for just this one feature.

## 8. Calendar grid rendering (R2)

**Options considered:**
- **`date-fns` + hand-built grid**: small date-math library, `MonthGrid`/`WeekGrid`/`DayGrid` built as Tailwind grids.
- **A full calendar library** (e.g. `react-big-calendar`): faster to stand up day/week/month views, but ships its own CSS/theming model that fights Tailwind v4's token-based theme (`globals.css`'s `oklch` variables), and would be the first UI framework dependency in an otherwise hand-rolled component set (`TaskList`/`TaskRow` etc. are all hand-built).

**Chosen: `date-fns` + hand-built grid.** Consistent with how every other list/board view in the app is built, avoids a reskinning project, and the grid logic itself (given a date range, lay out cells + events) is not complex enough to justify a dependency with its own opinions about markup and CSS.

## 9. Google sync mechanism

**Options considered:**
- **Polling with `syncToken` incremental sync**: mirrors the existing `poll_emails_background` `tokio::time::interval` pattern; first sync does a full `events.list` and stores the returned `nextSyncToken`, every subsequent poll passes it so Google returns only deltas.
- **Full refetch every poll tick**: simpler (no token bookkeeping), but re-pulls the entire visible window every time.

**Chosen: `syncToken` incremental sync.** A desktop app can't host a public webhook endpoint for Google's push notifications, so polling is the only realistic transport regardless — but there's no reason to pay for a full refetch every tick when Google's API supports incremental sync natively, and the existing email poller already establishes the `tokio::time::interval` idiom this can copy directly.

## 10. Tier gating

**Options considered:**
- **Pro-only**, matching `emails`/`ai_features` in `featureGating.ts` (both involve external sync/background polling, same shape as this feature).
- **Available on all tiers.**

**Chosen: available on all tiers** — explicit decision, not defaulted from the `emails`/`ai_features` precedent despite the structural similarity.

## 11. Recurring meetings

**Options considered:**
- **Punt to a fast-follow issue**: this round only creates single/non-recurring meetings; an existing recurring Google event still syncs in (Google expands it server-side into individual instances, each becoming its own `meetings` row).
- **Include basic recurrence now** (daily/weekly/monthly rule, simple end condition) in the schema and create-form.

**Chosen: punt.** Not mentioned in the original issue at all, and Google's `recurrence` field (RRULE-based) doesn't fit the flat `meetings` schema without either storing the rule and re-expanding it client-side or relying entirely on Google's server-side expansion — a design question worth its own scoping pass rather than folding into an already-large feature.
