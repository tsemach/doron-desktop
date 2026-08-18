# ASC-163: Add Calendar Support — Stacked PR Plan

## PR overview

| PR # | Sub-issue | Branch | PR title | Scope | Stacked on |
|---|---|---|---|---|---|
| PR-0 | [ASC-164](https://linear.app/amicusx/issue/ASC-164/pr-0-calendar-design-docs) | `tsemachmizrachi/asc-164-pr-0-calendar-design-docs` | `[ASC-163][PR-0] Calendar design docs` | Adds `docs/calendar/` only (`why-and-requirements.md`, `brainstorm.md`, `design.md`, `plan.md`). No code. | `master` |
| PR-1 | [ASC-165](https://linear.app/amicusx/issue/ASC-165/pr-1-calendar-schema-google-oauth) | `tsemachmizrachi/asc-165-pr-1-calendar-schema-google-oauth` | `[ASC-163][PR-1] Calendar schema + Google OAuth` | `meetings` + `google_calendar_accounts` schema; `calendar/oauth.rs`; connect/disconnect/status commands; deep-link handler arm | PR-0 |
| PR-2 | [ASC-166](https://linear.app/amicusx/issue/ASC-166/pr-2-calendar-sync-engine) | `tsemachmizrachi/asc-166-pr-2-calendar-sync-engine` | `[ASC-163][PR-2] Calendar sync engine` | `calendar/sync.rs` background poller; `calendar/case_link.rs` phrase matching; `create/update/delete/list_*_meeting(s)` commands | PR-1 |
| PR-3 | [ASC-167](https://linear.app/amicusx/issue/ASC-167/pr-3-calendar-reminders) | `tsemachmizrachi/asc-167-pr-3-calendar-reminders` | `[ASC-163][PR-3] Calendar reminders` | `tauri-plugin-notification`; `calendar/reminder.rs` background scanner | PR-2 |
| PR-4 | [ASC-168](https://linear.app/amicusx/issue/ASC-168/pr-4-calendar-tab-ui) | `tsemachmizrachi/asc-168-pr-4-calendar-tab-ui` | `[ASC-163][PR-4] Calendar tab UI` | `date-fns`; `components/Calendar/` (grids, form, connect prompt, `MeetingBox`); `useMeetingList`; route + nav tile; i18n | PR-3 |
| PR-5 | [ASC-169](https://linear.app/amicusx/issue/ASC-169/pr-5-case-details-meetings) | `tsemachmizrachi/asc-169-pr-5-case-details-meetings` | `[ASC-163][PR-5] Case details meetings` | `CaseDetailTab` gains `"meetings"`; `CaseMeetingsPanel.tsx`; `CaseOverviewMeetingsCard.tsx` | PR-4 |
| PR-6 | [ASC-170](https://linear.app/amicusx/issue/ASC-170/pr-6-home-todays-meetings) | `tsemachmizrachi/asc-170-pr-6-home-todays-meetings` | `[ASC-163][PR-6] Home today's meetings` | "Today's Meetings" card in `AppHomeOverview.tsx` | PR-5 |

**Merge direction is the reverse of the stack order**: PR-6 → PR-5 → PR-4 → PR-3 → PR-2 → PR-1 → PR-0 → `master`, one cascading merge at a time, `master` last. See "Process rules" below.

All 7 Linear sub-issues (ASC-164–ASC-170) are created under [ASC-163](https://linear.app/amicusx/issue/ASC-163/add-calendar-support) as of this writing. Branch names above are Linear's actual auto-generated `gitBranchName` for each — use them verbatim when creating branches, don't hand-invent a slug.

## Naming convention (so this plan is recoverable across a chat restart)

Every branch name and every PR title embeds its PR number, lowercase and hyphenated (`pr-0` through `pr-6`), exactly as shown in the table above — this fell out naturally from titling each Linear sub-issue `PR-<N>: <Title>` and letting Linear auto-generate the branch name from it:
- **Branch**: Linear's `gitBranchName` for the matching sub-issue, e.g. `tsemachmizrachi/asc-165-pr-1-calendar-schema-google-oauth` — always copy it from the sub-issue rather than typing a new one.
- **PR title**: `[ASC-163][PR-<N>] <Title>`

The point of this convention: if this conversation's context is lost, `git branch -a` / `gh pr list` / the ASC-164–ASC-170 sub-issues alone are enough to reconstruct exactly where the stack stands — no need to re-derive it from chat history.

## Context

Linear issue [ASC-163](https://linear.app/amicusx/issue/ASC-163/add-calendar-support) ("Add calendar support") bundles a new top-level tab, day/week/month grid views, two-way Google Calendar sync, description-based case linking, pre-meeting notifications, and two separate case-detail integration points — too large for one PR, comparable in size to [ASC-91](../task-management/plan.md) (task management, delivered as a 9-PR stack). Delivered here as a `git stack` of independently-reviewable branches, backend-before-frontend within each capability, so each branch rebases cleanly on its predecessor and the app keeps compiling/working at every step.

Full technical design: [`design.md`](./design.md). Requirements and decisions: [`why-and-requirements.md`](./why-and-requirements.md) / [`brainstorm.md`](./brainstorm.md).

## Cross-cutting decisions (carried over from the design, not re-litigated per branch)

- **Google is the sync source of truth**: every write goes to Google first (`events.insert`/`update`/`delete` via `reqwest`), local `meetings` rows are a mirror, never an independent record (`design.md` §1, §6).
- **No migration framework** — new tables (`meetings`, `google_calendar_accounts`) follow the existing `const ..._SCHEMA` + `execute_batch` pattern in `store/mod.rs` (`design.md` §3).
- **Case-link matching is near-exact only** — reuses `email/normalize.rs::normalize_for_match`, does not call into `case_matcher/`/`match_email_core` (`design.md` §6).
- **Background work is two independent `tokio::time::interval` loops** (sync poller, reminder scanner), both spawned in `lib.rs::setup()` next to the existing email poller — deliberately not combined into one loop, so a slow Google API call never delays a time-sensitive reminder (`design.md` §5, §7).
- **No tier gating** — Calendar is available on every subscription tier, unlike `emails`/`ai_features`.
- **Task-attachment and recurring-meeting creation are out of scope** for every branch below — not deferred to a later branch in this stack, tracked as separate future issues if picked up.

### Branch details

**PR-0 — calendar-docs (ASC-164).** Adds `docs/calendar/why-and-requirements.md`, `docs/calendar/brainstorm.md`, `docs/calendar/design.md`, and this file — no code, no schema, no commands. Branches directly from `master`. Every other PR in the stack depends on it purely so the docs are present in history before the code that implements them; nothing here is meant to be "reviewed" for correctness against running code — it's already been reviewed as text.

**PR-1 — calendar-schema-google-oauth (ASC-165).** Schema (`store/mod.rs`, new `CALENDAR_SCHEMA` const batched alongside `TASKS_SCHEMA`):
```sql
CREATE TABLE IF NOT EXISTS google_calendar_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, google_email TEXT NOT NULL,
    access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
    token_expires_at TEXT NOT NULL, sync_token TEXT, connected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, google_event_id TEXT NOT NULL UNIQUE,
    case_id INTEGER, title TEXT NOT NULL, description TEXT, location TEXT,
    start_time TEXT NOT NULL, end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','tentative','cancelled')),
    case_link_source TEXT NOT NULL DEFAULT 'none' CHECK (case_link_source IN ('none','phrase_match','manual')),
    created_at TEXT NOT NULL, updated_at TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_case_id ON meetings(case_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time);
```
Full column set up front (mirrors ASC-91/B3's approach) so no later branch needs another schema pass. New `apps/desktop/src-tauri/src/calendar/oauth.rs`: consent-URL builder, deep-link callback handling (second arm on the existing `app.deep_link().on_open_url(...)` closure in `lib.rs::setup()`, not a new listener), token exchange/refresh via `reqwest`, `save_google_calendar_account_internal`/`get_google_calendar_account_internal` (mirrors `auth::save_session_internal`). New `calendar/mod.rs` with the three account-lifecycle commands. `lib.rs`: `pub mod calendar;` + register under `// calendar`. No sync, no meeting CRUD, no UI yet — verified via the connect flow completing and a row landing in `google_calendar_accounts`.

**PR-2 — calendar-sync-engine (ASC-166).** `calendar/sync.rs::poll_calendar_background` (`tokio::time::interval(60s)`, mirrors `email/emails_ops.rs::poll_emails_background` exactly, including `MissedTickBehavior::Delay`), spawned in `lib.rs::setup()`. `calendar/case_link.rs::extract_case_phrase`/`match_case_by_phrase` (regex + `normalize_for_match` reuse, per `design.md` §6 — explicitly not touching `case_matcher/`). `create_meeting`/`update_meeting`/`delete_meeting` commands (write-through to Google, then local mirror) plus the three list commands. This is the branch where the feature becomes functionally complete end-to-end (minus notifications and UI) — testable via direct `invoke()` calls or a temporary test harness before PR-4 builds the real UI.

**PR-3 — calendar-reminders (ASC-167).** `cargo add tauri-plugin-notification` + `pnpm add @tauri-apps/plugin-notification`; new `"notification:default"` entry in `capabilities/default.json`; `.plugin(tauri_plugin_notification::init())` in `lib.rs`, same registration shape as every other plugin there. `calendar/reminder.rs::remind_upcoming_meetings_background` (`tokio::time::interval(30s)`, in-memory `HashSet<i64>` dedup, 5-minute lead time), spawned as a second independent loop in `lib.rs::setup()`. Depends on PR-2 for `meetings` data to scan.

**PR-4 — calendar-tab-ui (ASC-168).** `pnpm add date-fns`. New `apps/desktop/src/components/Calendar/`: `Calendar.tsx` (mirrors `TaskManagement.tsx`'s header + nested-routes shape), `CalendarHeader.tsx` (mirrors `TaskManagementHeader.tsx`), `ConnectGoogleCalendarPrompt.tsx`, `MonthGrid.tsx`/`WeekGrid.tsx`/`DayGrid.tsx`, `MeetingForm.tsx`, `MeetingBox.tsx` (shared rendering unit, reused by PR-5/PR-6). New `hooks/useMeetingList.ts` (mirrors the existing `useTaskList` shape). Route in `AppMain.tsx` (`/calendar/*`); third `NAV_TILE_CLASS` tile in `AppHome.tsx` (`CalendarDays` icon) — note the current 2-tile layout needs the same small adjustment ASC-91/B9 already flagged for a 3rd tile. i18n keys in `en.json`/`he.json`. This is the first branch with a manually-clickable screen — full manual verification of connect → view → create → see-it-land-in-Google happens here.

**PR-5 — case-details-meetings (ASC-169).** `CaseDetailSidebar.tsx`: widen `CaseDetailTab` to add `"meetings"`; new sidebar entry point. `CaseManagementOpenCasesDetails.tsx`: extend the `activeRightTab` switch to render new `CaseMeetingsPanel.tsx` (boxes layout via `MeetingBox.tsx` from PR-4, backed by `list_meetings_for_case` via `useMeetingList`) — same-panel switch, **no modal**, per the explicit correction in `brainstorm.md` §7. New `CaseOverviewMeetingsCard.tsx` in `CaseOverviewPanel.tsx`, structurally mirrors `CaseOverviewTasksCard.tsx`.

**PR-6 — home-todays-meetings (ASC-170).** `AppHomeOverview.tsx`: add `invoke<Meeting[]>("list_todays_meetings")` to the existing `Promise.all([...])`, new "Today's Meetings" `CARD_CLASS` block following the same loading/error/empty idiom as the three existing cards, rows rendered via `MeetingBox.tsx` from PR-4.

---

## Process rules

1. **Approval gate**: after each branch's implementation is complete and pushed as a PR, stop and wait for explicit approval before starting the next branch. No chaining ahead.
2. **Merge order (top-down, full cascade to master)**: once approved end-to-end, integration proceeds from the tip of the stack downward — PR-6 merges into PR-5, PR-5 into PR-4, PR-4 into PR-3, PR-3 into PR-2, PR-2 into PR-1, PR-1 into PR-0, and **finally PR-0 merges into `master` last**. Each PR's GitHub base is its stack predecessor, so this is a straightforward sequential merge in reverse branch order — `master` is only ever touched once, at the very end.
3. **Fixing an earlier PR after later ones exist**: this repo has `git-stack` support — use `git stack amend -a` / `git stack reword` on the earlier branch rather than manually rebasing. Every descendant branch in the stack rebases automatically. Do not hand-rebase individual branches.
4. **Branch & PR naming**: every branch and PR title carries its PR number, per the "Naming convention" section above — non-negotiable, since it's what makes the stack's state legible from `git`/`gh` alone if this conversation restarts.
5. **Linear sub-issues**: ✅ done — ASC-164 (PR-0) through ASC-170 (PR-6) are created under ASC-163, titled `PR-<N>: <Title>`. Link each branch's PR description to its sub-issue when opened.

## git-stack workflow

```bash
# PR-0 (ASC-164): docs only, branches directly from master
git checkout -b tsemachmizrachi/asc-164-pr-0-calendar-design-docs master
# ... add docs/calendar/, commit, push, open PR titled "[ASC-163][PR-0] Calendar design docs" (base=master), STOP for approval ...

# PR-1 (ASC-165), stacked on PR-0
git checkout -b tsemachmizrachi/asc-165-pr-1-calendar-schema-google-oauth tsemachmizrachi/asc-164-pr-0-calendar-design-docs
# ... implement PR-1, commit, push, open PR titled "[ASC-163][PR-1] Calendar schema + Google OAuth" (base=PR-0), STOP for approval ...

# PR-2 (ASC-166), stacked on PR-1
git checkout -b tsemachmizrachi/asc-166-pr-2-calendar-sync-engine tsemachmizrachi/asc-165-pr-1-calendar-schema-google-oauth
# ... implement PR-2, commit, push, open PR (base=PR-1), STOP for approval ...
# ... repeat through PR-6 (ASC-170), always branching from the previous branch ...
```
- `git stack` — show the stack / verify order.
- `git stack next -b` / `git stack previous -b` — navigate branch tips.
- `git stack amend -a` / `git stack reword` — fix an earlier branch (e.g. PR-2) after later branches (PR-3+) already exist; descendants auto-rebase. **This is the required method for fixing already-pushed earlier PRs** — see Process rule 3.
- `git stack sync` — rebase the whole stack onto `master` if it moves during development.
- `git stack run -- <cmd>` — verify every commit in the stack builds (`cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`, `npx tsc --noEmit` in `apps/desktop/`).
- `git stack --push` — only after confirmation, per branch.

## Verification (per branch)

- Rust: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`; unit tests for `extract_case_phrase`/`match_case_by_phrase` (PR-2) and an integration test for `sync_once` against a mocked Google response, including the `410 Gone` full-resync path (PR-2).
- Frontend: `npx tsc --noEmit` in `apps/desktop/`.
- Manual, via the `run`/`debug` skill, scoped to what that branch actually changed — PR-0 is docs-only (no verification needed beyond proofreading); PR-1 through PR-3 have no clickable UI (verify via direct `invoke()` calls or logs); PR-4 onward gets full click-through verification, including confirming a meeting created in-app actually appears in Google Calendar and vice versa.
- PR-3 specifically needs a real Windows manual check that the OS notification actually pops (not just that `.show()` doesn't error).

### Critical files
- `apps/desktop/src-tauri/src/store/mod.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/auth/mod.rs` (OAuth/deep-link pattern to mirror)
- `apps/desktop/src-tauri/src/email/emails_ops.rs` (background-poller pattern to mirror)
- `apps/desktop/src-tauri/src/email/normalize.rs` (`normalize_for_match`, reused as-is)
- `apps/desktop/src/components/TaskManagement/TaskManagement.tsx` (top-level feature shape to mirror)
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementOpenCasesDetails.tsx`
- `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseOverviewPanel.tsx`
- `apps/desktop/src/components/App/AppHomeOverview.tsx`
