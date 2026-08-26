# Notification Center — Design

Design for [ASC-123](https://linear.app/amicusx/issue/ASC-123/add-notification-center) — a generic, persistent notification infrastructure that any part of the app can push into (email arrived, task due, AI credit low, and future producers), surfaced through one always-visible bell across every module, with per-category settings and close/delete/snooze lifecycle.

---

## 1. Goals and non-goals

**Goals**

1. One small Rust API (`notifications::create`) that any producer module calls to raise a notification — no producer hand-rolls its own persistence or delivery.
2. A notification persists across app restarts; closing it hides it from the default view but keeps it retrievable, deleting it removes it for good. These are distinct states, not one dismiss action.
3. A notification can be snoozed — preset durations, or a custom date/time via a new shared `DateTimePicker` component — and reappears once the snooze elapses, the next time the notification list is fetched (bell open, app restart). **Known gap (final review, v1):** re-firing the category's OS toast on elapse is not implemented — that requires an active elapse-detection loop, out of proportion to this pass. In-app resurfacing works; the OS toast does not repeat.
4. Each notification carries its own click target so the bell UI navigates generically, with zero per-category branching in the frontend.
5. A notification bell, fixed at the bottom-right corner and visible from every module (Cases, Docs, Tasks, Calendar, Settings), backed by a new shared `AppShell` — not duplicated per module.
6. Per-category settings: independent **in-app** and **OS toast** toggles, so e.g. task-due can pop a native OS toast while email-arrived stays in-app only.
7. Two initial producers wired in this pass: email arrived, task due (the ticket's "follow up due date" and "tasks needs to be done" map to the same `tasks.due_date` signal today — see §4.2, no schema field distinguishes them). AI credit low is designed for (category + settings row exist) but not wired — no credit-metering system exists yet to call it.
8. The existing ad-hoc "pending email alerts to review" floating widget is retired in favor of this infrastructure — email notifications (both "new email arrived" and "email awaiting case-match review") go through the same bell as everything else, not a second, separate floating trigger.

**Non-goals — explicitly out of scope**

- AI credit metering itself — out of scope for this ticket; only the notification category/settings row is reserved so that system can call `notifications::create` once it exists.
- Retrofitting `MeetingForm.tsx` / `TaskForm.tsx` to use the new shared `DateTimePicker` (§5.1) — worth doing given they duplicate the same date/time-input logic it replaces, but out of scope for this ticket; call out as a natural follow-up, not bundle an unrelated refactor into this PR.
- Cross-device or server-synced notifications — this is a local SQLite table, per desktop install, same as every other data type in the app.
- Notifications while the app isn't running — no system-tray/always-on service (same boundary the calendar reminder feature already draws, see `docs/calendar/design.md` §"Non-goals").
- A generic "notification templates" authoring UI — categories and their copy are defined in Rust producer code, not user-configurable text.

## 2. What exists vs. what is missing

| Capability | Status | Location |
|---|---|---|
| SQLite schema conventions (`_SCHEMA` consts, `CREATE TABLE IF NOT EXISTS`, `CHECK` enums, `idx_<table>_<col>` indexes, idempotent `ALTER TABLE` column migrations) | ✅ | `apps/desktop/src-tauri/src/store/mod.rs` |
| "Emit change notification to frontend" event pattern (Rust `app.emit(...)` after a DB write, frontend `listen()`) | ✅ | `documents/versioning.rs:450`, `case/mod.rs:910`, consumed in `App.tsx` (`deep-link-navigate` listener) |
| OS-level toast delivery (`tauri-plugin-notification`, already a dependency) | ✅ | `calendar/reminder.rs` (`app.notification().builder()...show()`), `lib.rs:172` (`.plugin(tauri_plugin_notification::init())`) |
| Background `tokio::time::interval` scanning-loop pattern | ✅ | `calendar/reminder.rs::remind_upcoming_meetings_background` (pattern to mirror for the task-due scanner) |
| Jotai store + `listen()`-driven live update pattern (frontend) | ✅ | `store/authStore.ts`, `store/aiStore.ts` |
| Settings tab registration (`TabType` union + `SettingMenuTabItem` + panel component) | ✅ | `components/Settings/SettingMenuTab.tsx`, `Settings.tsx` |
| Single-row / small settings-table pattern | ✅ | `ai_configurations` (`store/mod.rs:352`), `google_calendar_accounts` (`store/mod.rs:1076`) |
| A queue of email items to *review and act on* (case-match suggestions) — data model is a related but distinct concept, kept as-is | ✅ (do not repurpose the table/schema) | `pending_email_alerts` table, `email/emails_alerts.rs` |
| Ad-hoc, duplicated date/time-input logic — separate `date`+`time` native inputs plus local `toDateInputValue`/`toTimeInputValue` helpers, no shared component | ✅ (do not extend further — replace) | `Calendar/MeetingForm.tsx:47-53,167-193` (start+end date/time), `components/ui/TaskForm.tsx:41,140` (due date) |
| Global chrome already rendered once, outside all routes (precedent for `AppShell`) | ✅ | `UpdateBanner` in `App.tsx:80`, sibling to `{session ? <AppMain/> : <AppLogin/>}` |
| A floating, self-contained "pending email alerts" trigger + panel at `fixed bottom-6 right-6 z-50`, already externally-openable via a `window` `CustomEvent` (`open-email-alert-review`, already dispatched from `AppHomeRecentCases.tsx`) | ⚠️ retiring its trigger button only, §5.2 | `CaseManagementEmailAlertReview.tsx:45-46,155` — occupies the exact corner the new bell needs; its panel, state, and existing event listener are reused as-is, only its bespoke floating button is deleted |
| **`AppShell` (hosts `UpdateBanner` + `NotificationBell`)** | ❌ | new, §5 |
| **Shared `DateTimePicker` component** | ❌ | new, §5.1 |
| **`notifications` / `notification_settings` tables** | ❌ | new, §3 |
| **`notifications/` Rust module + producer API** | ❌ | new, §4 |
| **Task-due background scanner** | ❌ | new, §4.3 |
| **Notification Tauri commands** | ❌ | new, §4.4 |
| **`NotificationBell` / panel frontend** | ❌ | new, §5 |
| **Notifications settings tab** | ❌ | new, §6 |

## 3. Data model

Two new tables in `store/mod.rs`, alongside the existing `_SCHEMA` constants, following the exact conventions already in place (INTEGER PK, RFC3339 TEXT timestamps, `CHECK` enums, `idx_<table>_<col>` indexes).

```sql
const NOTIFICATIONS_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS notifications (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        category       TEXT    NOT NULL,
        title          TEXT    NOT NULL,
        body           TEXT    NOT NULL,
        click_target   TEXT,                 -- JSON, e.g. {\"route\":\"/case-management/cases/42\"} or {\"route\":\"/case-management\",\"windowEvent\":\"open-email-alert-review\"}; nullable (not every notification navigates anywhere)
        status         TEXT    NOT NULL DEFAULT 'unread'
                                CHECK (status IN ('unread','read','closed','deleted')),
        created_at     TEXT    NOT NULL,
        snooze_until   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_status       ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_category     ON notifications(category);
    CREATE INDEX IF NOT EXISTS idx_notifications_snooze_until ON notifications(snooze_until);

    -- One row per category, upserted the first time that category is ever raised
    -- (see notifications::ensure_settings_row) so Settings always has something
    -- to render even before a producer has fired.
    CREATE TABLE IF NOT EXISTS notification_settings (
        category         TEXT    PRIMARY KEY,
        in_app_enabled   INTEGER NOT NULL DEFAULT 1,
        os_toast_enabled INTEGER NOT NULL DEFAULT 0
    );
";
```

`category` is a free-form string, not an enum/foreign-key table — a new producer introduces a new category value and calls `ensure_settings_row` once, with no schema migration required. Known categories for this pass: `email_arrived`, `task_due`, `ai_credit_low` (reserved, unwired).

`click_target` has exactly two optional keys, both interpreted generically (never a `category` switch, §5.2): `route` — passed straight to `navigate()` — and `windowEvent` — an opaque event name passed straight to `window.dispatchEvent(new CustomEvent(...))`, generalizing the `open-email-alert-review`-style mechanism that already exists rather than inventing a parallel one. A producer that needs to pass extra context beyond navigation serializes it into the route's own params/query string instead of growing this schema further.

Per-category `os_toast_enabled` defaults: `task_due` → `1` (mirrors the existing meeting-reminder OS-toast behavior it's conceptually closest to); `email_arrived` and `ai_credit_low` → `0` (in-app only by default, matches your answer that these shouldn't be as intrusive as a due-date/meeting-style alert).

## 4. Rust: `notifications/` module

New directory `apps/desktop/src-tauri/src/notifications/`, following the existing per-feature module layout (`email/`, `calendar/`, `task/`, `case/`).

### 4.1 `mod.rs` — producer API

```rust
pub struct NewNotification {
    pub category: String,
    pub title: String,
    pub body: String,
    pub click_target: Option<serde_json::Value>,
}

pub fn create(app: &AppHandle, new: NewNotification) -> Result<i64, String> {
    let conn = store::open_db(app)?;
    ensure_settings_row(&conn, &new.category)?;                 // idempotent upsert-if-absent
    let settings = get_settings_for_category(&conn, &new.category)?;

    let id = store::insert_notification(&conn, &new)?;          // INSERT, status='unread'

    if settings.in_app_enabled {
        let row = store::get_notification(&conn, id)?;
        let _ = app.emit("notification-created", &row);         // best-effort, same as existing emit call sites
    }
    if settings.os_toast_enabled {
        let _ = app.notification().builder().title(&new.title).body(&new.body).show();
    }
    Ok(id)
}
```

This is the *entire* integration surface a producer needs — one function call, no direct SQL, no event-emitting boilerplate. Matches the ticket's ask for "a simple and easy API to add notifications."

### 4.2 Wiring existing producers

- **Email arrived** — `emails_orchestrate.rs::apply_pipeline_outcome` (called from `emails_ingestion.rs:202`) has exactly two outcomes, not three: a `pending_email_alerts` row needing human review (`result.should_surface_alert()`, `emails_orchestrate.rs:298-320`), or a silently-ignored spam/marketing message (`emails_orchestrate.rs:322+`, no notification). There is no code path anywhere that auto-links an email directly to a case without review — that only happens once a human confirms the suggestion in `CaseManagementEmailAlertReview`. So there is exactly one `click_target` shape for this producer, not two: one `notifications::create` call added right after the existing `let _ = app.emit("new-email-alert", ());` at `emails_orchestrate.rs:320`, with `click_target: {"route": "/case-management", "windowEvent": "open-email-alert-review"}` — the same event that already drives `CaseManagementEmailAlertReview`'s panel.
- **Task due** — a `due_date` already exists on `tasks` (`store/mod.rs:1047`, `idx_tasks_due_date`), and it's the *only* due-date concept in the data model: `Task`/`TaskWithCase` (`task/types.ts`) and the `tasks` table have no field distinguishing a "follow-up" from an ordinary task. The ticket's "follow up due date" and "tasks needs to be done" bullets are both this one signal — collapsed into a single `task_due` category rather than inventing a distinction the schema doesn't have. If the product genuinely wants "follow-up" to mean something different from "task" later (e.g. a lighter-weight reminder not tied to a full task row), that needs new schema, not something to fake here.

### 4.3 Task-due background scanner

New `notifications/task_scanner.rs`, structurally mirroring `calendar/reminder.rs::remind_upcoming_meetings_background`: its own independent `tokio::time::interval` loop (not reused from the calendar or email pollers — a slow poller elsewhere must never delay or block this one, same reasoning `reminder.rs`'s header comment already states for its own independence from `sync.rs`), querying `tasks` for rows whose `due_date` has newly entered the lead window, calling `notifications::create` once per task with category `task_due`, with an in-memory `HashSet` dedup exactly like `reminder.rs::notified` (a missed/duplicate reminder across a restart is a minor annoyance, not a correctness issue — same trade-off already accepted there).

### 4.4 Tauri commands (registered in `lib.rs`'s `generate_handler![]`)

| command | purpose |
|---|---|
| `list_notifications(status_filter?)` | active (unread+read) by default; a `closed` filter for "see it later" |
| `update_notification_status(id, status)` | mark read / close / delete |
| `snooze_notification(id, until)` | sets `snooze_until`; scanner-side, a snoozed row is simply excluded from `list_notifications`'s default query until it passes, then reappears through the normal unread flow (no separate "un-snooze" event needed) |
| `get_notification_settings()` / `update_notification_settings(category, in_app_enabled, os_toast_enabled)` | backs §6 |

## 5. Frontend: `AppShell` + bell

`App.tsx`'s actual current return (not a plain two-way ternary) is:

```tsx
// App.tsx:77-93 — current
return (
  <LanguageProvider>
    <FontProvider>
      <UpdateBanner />
      {checkingSession ? (
        <div className="...">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : gated ? (
        <AppLogin />
      ) : (
        <AppMain />
      )}
    </FontProvider>
  </LanguageProvider>
);
```

`UpdateBanner` is the only piece of cross-cutting global chrome today (`AppMain.tsx` itself routes straight into five independent, self-contained module layouts, each with its own sidebar, no shared chrome between them). Rather than add `NotificationBell` as a second ad-hoc line here, both become children of one new named component, `AppShell` — a single, explicit host for global chrome instead of lines accumulating in `App.tsx`'s own return. `AppShell` reads both session atoms itself (`sessionAtom` and `sessionStatusAtom`, both already exported from `store/authStore.ts`), so `App.tsx` doesn't need to pass anything new down:

```tsx
// apps/desktop/src/components/App/AppShell.tsx — new
export default function AppShell({ children }: { children: React.ReactNode }) {
  const session = useAtomValue(sessionAtom);
  const sessionStatus = useAtomValue(sessionStatusAtom);
  const showBell = sessionStatus === "ready" && session !== null;
  return (
    <div className="relative h-screen">
      <UpdateBanner />                       {/* moved from App.tsx, behavior unchanged */}
      {showBell && <NotificationBell />}     {/* new — bottom-right, only once a real session exists */}
      {children}
    </div>
  );
}
```

```tsx
// App.tsx:77-93 — changed
return (
  <LanguageProvider>
    <FontProvider>
      <AppShell>
        {checkingSession ? (
          <div className="...">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : gated ? (
          <AppLogin />
        ) : (
          <AppMain />
        )}
      </AppShell>
    </FontProvider>
  </LanguageProvider>
);
```

`UpdateBanner` keeps its exact current behavior (still visible during the loading/login states too — `AppShell` renders it unconditionally, same as today). `NotificationBell` only shows once `sessionStatus === "ready"` *and* a real session exists — not merely "session is truthy," since a notification's `click_target` navigates into routes that require auth and there's nothing meaningful to show while still checking or logged out. `AppShell` stays a thin host, not a new layout system — it does not touch any existing module's internal sidebar/header.

`NotificationBell` renders at `fixed bottom-6 right-6 z-50` — the same corner and z-index `CaseManagementEmailAlertReview`'s retired floating trigger used (§5.2), so it inherits real estate that's already established as free of other floating chrome, rather than staking out a new corner cold.

- **`store/notificationStore.ts`** (new; atoms follow the same plain-`atom()`-export shape as `authStore.ts`'s `sessionAtom`): `notificationsAtom`, `unreadCountAtom` (derived). The actual `listen("notification-created", ...)` call is **not** in this file — following the real precedent (`App.tsx`'s `deep-link-navigate` listener and `CaseManagementEmailAlertReview.tsx`'s `new-email-alert` listener are both component-local `useEffect`s, not store-file code, and neither `authStore.ts` nor `aiStore.ts` contains a `listen()` call) — it lives in a `useEffect` inside `NotificationBell.tsx` itself, patching `notificationsAtom` in place via `getDefaultStore()`. No polling.
- **`components/Notifications/NotificationBell.tsx`** — icon + unread-count badge, opens `NotificationPanel`.
- **`components/Notifications/NotificationPanel.tsx`** — active notifications newest-first; each row: click body → mark read, `navigate(click_target.route)` if present, and `window.dispatchEvent(new CustomEvent(click_target.windowEvent))` if present (§5.2); close button → `status: 'closed'`; delete button → `status: 'deleted'`; snooze menu (1h / tomorrow morning / next week / **Custom…**, the last opening `DateTimePicker` from §5.1) → `snooze_notification`.
- A separate "closed" view (filter toggle inside the panel, not a new route) satisfies "close but able to see it later."

No per-category component or branch exists anywhere in the frontend — `category` is only ever used as a settings-table key (§6); the bell renders every notification identically off `title`/`body`/`click_target`.

### 5.1 Shared `DateTimePicker` component

New `apps/desktop/src/components/ui/DateTimePicker.tsx` — a `radix-nova`-style primitive (Popover-triggered, matching how other dropdown/menu UI in `components/ui/` is built), so notification snooze isn't the third place in the codebase to hand-roll date/time input logic. `MeetingForm.tsx` (start+end) and `TaskForm.tsx` (due date) already duplicate the same `toDateInputValue`/`toTimeInputValue`-style helpers against plain native `<input type="date">`/`<input type="time">` pairs — this component generalizes that exact pattern instead of introducing a new one, so it stays a drop-in replacement for them later (§ non-goals — not done in this PR, but the API is shaped so that follow-up is a mechanical swap, not a rewrite).

```tsx
interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;       // e.g. "now" — snooze can't target the past
  placeholder?: string;
}
```

Internally: a trigger button showing the formatted value (via `date-fns`, already a dependency — no new package needed), opening a `Popover` containing the same native `date`+`time` input pair `MeetingForm`/`TaskForm` already use today, combined into one `Date` on change. Deliberately not built on a calendar-grid library (e.g. `react-day-picker`) — the existing convention in this codebase for date entry is native inputs, and introducing a grid-picker dependency for one component would be a bigger footprint than the problem calls for (Local Convention First).

Notification snooze's "Custom…" menu entry opens this component; the resulting `Date` is serialized to RFC3339 and passed to the existing `snooze_notification(id, until)` command from §4.4 unchanged — no backend change needed, since that command already takes an arbitrary timestamp rather than a preset enum.

### 5.2 Retiring the email-alert floating trigger

`CaseManagementEmailAlertReview.tsx:155` currently renders its own `fixed bottom-6 right-6 z-50` bouncing button + slide-out panel, mounted globally within `CaseManagement.tsx` whenever `pending_email_alerts` has rows. Since email notifications now go through the same bell as everything else (§1 goal 8), this becomes two overlapping floating widgets doing conceptually the same job. The fix keeps the panel and its existing open mechanism entirely as-is, and removes only the bespoke trigger button:

- The component already opens itself generically, from outside itself, via a plain `window` `CustomEvent` — this isn't new infrastructure, it's already there and already used from `AppHomeRecentCases.tsx`:
  ```tsx
  // CaseManagementEmailAlertReview.tsx:45-46 — existing, untouched
  const handleOpen = () => setIsOpen(true);
  window.addEventListener("open-email-alert-review", handleOpen);
  ```
  ```tsx
  // AppHomeRecentCases.tsx:113-119 — existing precedent for triggering it remotely
  navigate("/case-management");
  setTimeout(() => window.dispatchEvent(new CustomEvent("open-email-alert-review")), 100);
  ```
- `click_target.windowEvent` (§3) generalizes this exact mechanism instead of replacing it: `NotificationPanel`'s click handler does `if (click_target.windowEvent) window.dispatchEvent(new CustomEvent(click_target.windowEvent))` — a single generic line, no knowledge of what `"open-email-alert-review"` means, so no per-category branching is introduced (§1 goal 4 still holds) and no new atom or store is needed.
- The only actual change to `CaseManagementEmailAlertReview.tsx` is deleting its `{!isOpen && (<button ...>)}` bouncing-trigger block (part of line 155's surrounding JSX) — its `isOpen` state, its `useEffect`'s `open-email-alert-review` listener, its slide-out panel, and its `alerts.length === 0` early return are all untouched.
- This frees `fixed bottom-6 right-6 z-50` for `NotificationBell` itself (§5); the panel itself keeps that same anchor when open (unchanged), since it's a momentary overlay, not always-on chrome — it isn't visible at the same time as the bell being clicked to open it.

## 6. Settings

New `"notifications"` entry in `SettingMenuTab.tsx`'s `TabType` union, with a `Bell` icon `SettingMenuTabItem`, rendering new `components/Settings/SettingNotifications.tsx`. One row per category present in `notification_settings` (Email arrived, Task due, and AI credit low once that producer exists), each with its two independent toggles (in-app, OS toast) calling `update_notification_settings`. This is a plain table read/render — no new settings-blob or JSON-in-a-column pattern, consistent with how `ai_configurations` uses discrete typed columns rather than a serialized settings object.

## 7. Error handling

- `notifications::create` never fails a producer's own operation: email ingestion, task creation, etc. must all still succeed even if the notification insert fails. Producers call it as `let _ = notifications::create(...)` (fire-and-forget), matching how `documents/versioning.rs`'s own "emit change notification" is already best-effort/non-blocking.
- OS toast failures (permission denied/never granted) are silently swallowed, exactly as `calendar/reminder.rs` already does — the in-app notification still exists regardless.
- The scanner's dedup `HashSet` is in-memory only; an app restart may re-notify a task whose due window hasn't closed yet. Same accepted trade-off as `calendar/reminder.rs`, not a new risk.

## 8. Testing

- **Rust**: unit tests for `notifications::create` — correct row inserted, `notification-created` emitted only when `in_app_enabled`, OS toast attempted only when `os_toast_enabled`, `ensure_settings_row` is idempotent. New flat `tests/notifications_test.rs` using `store::open_db_by_path` against a temp file, mirroring `tests/task_crud_test.rs` (a same-sized module's existing test file) — not the `tests/embeddings/`-style subdirectory-with-`main.rs` pattern, which is reserved for larger suites needing shared helpers.
- **Rust**: scanner test — a task whose `due_date` enters the lead window produces exactly one notification per task per process lifetime (dedup), mirroring how `reminder.rs`'s own scan logic would be tested.
- **Frontend**: this codebase has no unit-test runner for React code today (no `vitest`/`jest`, no `*.test.tsx` anywhere in `apps/desktop/src` — confirmed by inspection, not assumed; `playwright` exists only for the `debug`/`run` skills' visual app verification). Frontend verification for `NotificationBell`/`NotificationPanel`/`DateTimePicker`/the retired trigger is manual: `npx tsc --noEmit` for type correctness, then running the app (`debug`/`run` skill) to confirm unread badge count, close/delete/snooze behavior, the custom-time picker, and that clicking an "email awaiting review" notification opens `CaseManagementEmailAlertReview` via the existing `open-email-alert-review` event. Introducing a test runner is out of scope for this ticket.

## 9. Open items for the follow-up implementation plan

- Exact lead-time window for the task-due scanner (calendar's meeting reminder is 5 minutes; a due-date notification likely wants something like "due today" / "overdue," not a minutes-scale window — needs a product call, not an engineering one).
- If "follow-up" should later mean something distinct from an ordinary task (§4.2), that requires a new schema field — not scoped here since nothing in the ticket's examples requires it beyond `tasks.due_date`.
