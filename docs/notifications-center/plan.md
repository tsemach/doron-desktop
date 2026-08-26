# Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, persistent notification infrastructure (Rust `notifications::create` API + SQLite storage + a bottom-right bell visible from every module) that email-arrived and task-due events push into today, with close/delete/snooze lifecycle and per-category settings.

**Architecture:** A new `notifications` SQLite table (status: unread/read/closed/deleted) and `notification_settings` table (per-category in-app/OS-toast toggles) in `store/mod.rs`, fronted by one Rust function (`notifications::create`) that any producer calls. A new `AppShell` component hosts a `NotificationBell` (bottom-right, `fixed bottom-6 right-6 z-50`) across every module, replacing the corner currently used by `CaseManagementEmailAlertReview`'s retired floating trigger — whose panel and open mechanism (an existing `window` `CustomEvent`) are reused as-is via a generic `click_target.windowEvent` field, not rebuilt.

**Tech Stack:** Rust (rusqlite, tauri-plugin-notification, tokio), React + TypeScript (Jotai, react-router-dom, date-fns), no new dependencies.

**Spec:** `docs/notifications-center/design.md`

## Global Constraints

- No new Rust or npm dependencies (Global constraint from spec §5.1, §7: `date-fns` and `tauri-plugin-notification` are already present; do not add `react-day-picker` or a Popover library).
- This codebase has no frontend unit-test runner (confirmed by inspection: no `vitest`/`jest`, no `*.test.tsx` files, `playwright` exists only for the `debug`/`run` skills' manual visual verification). Frontend tasks below are verified via `npx tsc --noEmit` + manual app run, not automated tests. Rust tasks use real `cargo test`.
- `category` is a free-form string column, never an enum/foreign-key table (spec §3) — new categories require no schema migration.
- `click_target` has exactly two optional JSON keys, `route` and `windowEvent`, both interpreted generically — never branch frontend code on `category` (spec §1 goal 4, §5.2).
- Follow existing per-feature Rust module layout (`email/`, `calendar/`, `task/`) — new code goes in `apps/desktop/src-tauri/src/notifications/`.
- No dropdown/menu component in this codebase is built on a Radix Popover — `apps/desktop/src/components/ui/` has no `popover.tsx`. The established hand-rolled pattern is `useState(open)` + an invisible full-screen overlay `<div>` to close-on-outside-click + an `absolute`-positioned panel (see `KebabMenu.tsx`). Use this pattern for the snooze dropdown and `DateTimePicker`, not a new primitive.

---

## Task 1: `notifications` + `notification_settings` schema

**Files:**
- Modify: `apps/desktop/src-tauri/src/store/mod.rs` (add `NOTIFICATIONS_SCHEMA` const near `CALENDAR_SCHEMA` at line 1076, and one `execute_batch` call in `open_db_by_path` alongside the existing schema calls at lines 157-185)
- Test: `apps/desktop/src-tauri/tests/notifications_test.rs` (new)

**Interfaces:**
- Produces: tables `notifications(id, category, title, body, click_target, status, created_at, snooze_until)` and `notification_settings(category, in_app_enabled, os_toast_enabled)`, queryable via `sqlite_master`.

- [ ] **Step 1: Write the failing test**

```rust
// apps/desktop/src-tauri/tests/notifications_test.rs
use rusqlite::Connection;
use tauri_app_lib::store;

fn setup_test_db(name: &str) -> Connection {
    let db_path = std::env::temp_dir().join(format!("notifications_test_{name}.db"));
    if db_path.exists() {
        let _ = std::fs::remove_file(&db_path);
    }
    store::open_db_by_path(&db_path).expect("should open full-schema test db")
}

#[test]
fn notifications_tables_exist() {
    let conn = setup_test_db("tables_exist");
    for table in ["notifications", "notification_settings"] {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name = ?1",
                rusqlite::params![table],
                |r| r.get(0),
            )
            .unwrap();
        assert!(n > 0, "{table} was not created");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test notifications_tables_exist`
Expected: FAIL (tables don't exist yet — `store::open_db_by_path` may even error before the assertion runs, since no `NOTIFICATIONS_SCHEMA` batch exists yet; either failure mode confirms the starting state).

- [ ] **Step 3: Add the schema const and wire it into `open_db_by_path`**

In `apps/desktop/src-tauri/src/store/mod.rs`, add near `CALENDAR_SCHEMA` (after line 1076's block, i.e. after the `meetings`/`google_calendar_accounts` schema):

```rust
// ── Notifications ─────────────────────────────────────────────────────────────
// ASC-123. A generic notification any producer module can raise via
// notifications::create — category is free-form so a new producer needs no
// schema migration. notification_settings is a small per-category row
// table (not a single-row JSON blob), matching how ai_configurations
// already stores config as discrete typed columns.
const NOTIFICATIONS_SCHEMA: &str = "
    CREATE TABLE IF NOT EXISTS notifications (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        category       TEXT    NOT NULL,
        title          TEXT    NOT NULL,
        body           TEXT    NOT NULL,
        click_target   TEXT,
        status         TEXT    NOT NULL DEFAULT 'unread'
                                CHECK (status IN ('unread','read','closed','deleted')),
        created_at     TEXT    NOT NULL,
        snooze_until   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_status       ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_category     ON notifications(category);
    CREATE INDEX IF NOT EXISTS idx_notifications_snooze_until ON notifications(snooze_until);

    CREATE TABLE IF NOT EXISTS notification_settings (
        category         TEXT    PRIMARY KEY,
        in_app_enabled   INTEGER NOT NULL DEFAULT 1,
        os_toast_enabled INTEGER NOT NULL DEFAULT 0
    );
";
```

Then, in `open_db_by_path`, right after the existing `conn.execute_batch(CALENDAR_SCHEMA).map_err(|e| format!("[calendar schema] {e}"))?;` line:

```rust
    conn.execute_batch(NOTIFICATIONS_SCHEMA).map_err(|e| format!("[notifications schema] {e}"))?;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test notifications_tables_exist`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/store/mod.rs apps/desktop/src-tauri/tests/notifications_test.rs
git commit -m "feat(notifications): add notifications + notification_settings schema"
```

---

## Task 2: Notification CRUD store functions

**Files:**
- Modify: `apps/desktop/src-tauri/src/store/mod.rs` (add `NotificationRow` struct + `insert_notification`/`get_notification`/`list_notifications`/`update_notification_status`/`snooze_notification`, placed near the `NOTIFICATIONS_SCHEMA` const from Task 1)
- Test: `apps/desktop/src-tauri/tests/notifications_test.rs` (extend)

**Interfaces:**
- Consumes: `notifications` table (Task 1).
- Produces: `pub struct NotificationRow { pub id: i64, pub category: String, pub title: String, pub body: String, pub click_target: Option<String>, pub status: String, pub created_at: String, pub snooze_until: Option<String> }`; `pub fn insert_notification(conn: &Connection, category: &str, title: &str, body: &str, click_target: Option<&str>) -> Result<i64, rusqlite::Error>`; `pub fn get_notification(conn: &Connection, id: i64) -> Result<NotificationRow, rusqlite::Error>`; `pub fn list_notifications(conn: &Connection, status_filter: Option<&str>) -> Result<Vec<NotificationRow>, rusqlite::Error>`; `pub fn update_notification_status(conn: &Connection, id: i64, status: &str) -> Result<(), rusqlite::Error>`; `pub fn snooze_notification(conn: &Connection, id: i64, until: &str) -> Result<(), rusqlite::Error>`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/desktop/src-tauri/tests/notifications_test.rs`:

```rust
#[test]
fn insert_and_get_notification_round_trip() {
    let conn = setup_test_db("insert_get");
    let id = store::insert_notification(&conn, "task_due", "Task due", "Body text", Some("{\"route\":\"/x\"}")).unwrap();
    let row = store::get_notification(&conn, id).unwrap();
    assert_eq!(row.category, "task_due");
    assert_eq!(row.title, "Task due");
    assert_eq!(row.status, "unread");
    assert_eq!(row.click_target.as_deref(), Some("{\"route\":\"/x\"}"));
}

#[test]
fn list_notifications_excludes_deleted_and_future_snoozes() {
    let conn = setup_test_db("list");
    let id1 = store::insert_notification(&conn, "task_due", "A", "a", None).unwrap();
    let id2 = store::insert_notification(&conn, "task_due", "B", "b", None).unwrap();
    store::update_notification_status(&conn, id2, "deleted").unwrap();
    let id3 = store::insert_notification(&conn, "task_due", "C", "c", None).unwrap();
    store::snooze_notification(&conn, id3, "2099-01-01T00:00:00Z").unwrap();

    let active = store::list_notifications(&conn, None).unwrap();
    let active_ids: Vec<i64> = active.iter().map(|r| r.id).collect();
    assert!(active_ids.contains(&id1));
    assert!(!active_ids.contains(&id2), "deleted notification should not appear in the default view");
    assert!(!active_ids.contains(&id3), "notification snoozed into the future should not appear");
}

#[test]
fn list_notifications_with_status_filter_ignores_snooze() {
    let conn = setup_test_db("list_filtered");
    let id = store::insert_notification(&conn, "task_due", "A", "a", None).unwrap();
    store::update_notification_status(&conn, id, "closed").unwrap();
    let closed = store::list_notifications(&conn, Some("closed")).unwrap();
    assert_eq!(closed.iter().map(|r| r.id).collect::<Vec<_>>(), vec![id]);
}

#[test]
fn update_notification_status_changes_status() {
    let conn = setup_test_db("update_status");
    let id = store::insert_notification(&conn, "email_arrived", "E", "e", None).unwrap();
    store::update_notification_status(&conn, id, "closed").unwrap();
    assert_eq!(store::get_notification(&conn, id).unwrap().status, "closed");
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test`
Expected: FAIL to compile (`store::insert_notification` etc. don't exist yet).

- [ ] **Step 3: Implement the store functions**

In `store/mod.rs`, near the `NOTIFICATIONS_SCHEMA` const:

```rust
#[derive(Serialize, serde::Deserialize, Clone)]
pub struct NotificationRow {
    pub id: i64,
    pub category: String,
    pub title: String,
    pub body: String,
    pub click_target: Option<String>,
    pub status: String,
    pub created_at: String,
    pub snooze_until: Option<String>,
}

fn notification_row_from_sql(row: &rusqlite::Row) -> rusqlite::Result<NotificationRow> {
    Ok(NotificationRow {
        id: row.get(0)?,
        category: row.get(1)?,
        title: row.get(2)?,
        body: row.get(3)?,
        click_target: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
        snooze_until: row.get(7)?,
    })
}

const NOTIFICATION_COLUMNS: &str = "id, category, title, body, click_target, status, created_at, snooze_until";

pub fn insert_notification(
    conn: &Connection,
    category: &str,
    title: &str,
    body: &str,
    click_target: Option<&str>,
) -> Result<i64, rusqlite::Error> {
    let created_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notifications (category, title, body, click_target, status, created_at)
         VALUES (?1, ?2, ?3, ?4, 'unread', ?5)",
        params![category, title, body, click_target, created_at],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_notification(conn: &Connection, id: i64) -> Result<NotificationRow, rusqlite::Error> {
    conn.query_row(
        &format!("SELECT {NOTIFICATION_COLUMNS} FROM notifications WHERE id = ?1"),
        params![id],
        notification_row_from_sql,
    )
}

/// `status_filter: None` returns the default "active" view (unread + read,
/// excluding anything currently snoozed into the future) -- a snoozed row
/// simply reappears through this same query once its snooze_until passes,
/// no separate "un-snooze" step needed. `Some(status)` bypasses the
/// active/snooze logic entirely (used for the "closed" filter view).
pub fn list_notifications(conn: &Connection, status_filter: Option<&str>) -> Result<Vec<NotificationRow>, rusqlite::Error> {
    match status_filter {
        Some(status) => {
            let sql = format!("SELECT {NOTIFICATION_COLUMNS} FROM notifications WHERE status = ?1 ORDER BY created_at DESC");
            let mut stmt = conn.prepare(&sql)?;
            stmt.query_map(params![status], notification_row_from_sql)?.collect()
        }
        None => {
            let now = chrono::Utc::now().to_rfc3339();
            let sql = format!(
                "SELECT {NOTIFICATION_COLUMNS} FROM notifications
                 WHERE status IN ('unread','read') AND (snooze_until IS NULL OR snooze_until <= ?1)
                 ORDER BY created_at DESC"
            );
            let mut stmt = conn.prepare(&sql)?;
            stmt.query_map(params![now], notification_row_from_sql)?.collect()
        }
    }
}

pub fn update_notification_status(conn: &Connection, id: i64, status: &str) -> Result<(), rusqlite::Error> {
    conn.execute("UPDATE notifications SET status = ?1 WHERE id = ?2", params![status, id])?;
    Ok(())
}

pub fn snooze_notification(conn: &Connection, id: i64, until: &str) -> Result<(), rusqlite::Error> {
    conn.execute("UPDATE notifications SET snooze_until = ?1 WHERE id = ?2", params![until, id])?;
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test`
Expected: PASS (all 5 tests so far)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/store/mod.rs apps/desktop/src-tauri/tests/notifications_test.rs
git commit -m "feat(notifications): add notification CRUD store functions"
```

---

## Task 3: Notification settings store functions

**Files:**
- Modify: `apps/desktop/src-tauri/src/store/mod.rs`
- Test: `apps/desktop/src-tauri/tests/notifications_test.rs` (extend)

**Interfaces:**
- Consumes: `notification_settings` table (Task 1).
- Produces: `pub struct NotificationSettingsRow { pub category: String, pub in_app_enabled: bool, pub os_toast_enabled: bool }`; `pub fn ensure_notification_settings_row(conn: &Connection, category: &str) -> Result<(), rusqlite::Error>`; `pub fn get_notification_settings_for_category(conn: &Connection, category: &str) -> Result<NotificationSettingsRow, rusqlite::Error>`; `pub fn list_notification_settings(conn: &Connection) -> Result<Vec<NotificationSettingsRow>, rusqlite::Error>`; `pub fn update_notification_settings(conn: &Connection, category: &str, in_app_enabled: bool, os_toast_enabled: bool) -> Result<(), rusqlite::Error>`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/desktop/src-tauri/tests/notifications_test.rs`:

```rust
#[test]
fn ensure_settings_row_is_idempotent_with_correct_per_category_defaults() {
    let conn = setup_test_db("ensure_settings");
    store::ensure_notification_settings_row(&conn, "task_due").unwrap();
    store::ensure_notification_settings_row(&conn, "task_due").unwrap(); // second call must not error or duplicate

    let all = store::list_notification_settings(&conn).unwrap();
    assert_eq!(all.iter().filter(|r| r.category == "task_due").count(), 1);

    let task_row = store::get_notification_settings_for_category(&conn, "task_due").unwrap();
    assert!(task_row.in_app_enabled);
    assert!(task_row.os_toast_enabled, "task_due should default OS toast on");

    store::ensure_notification_settings_row(&conn, "email_arrived").unwrap();
    let email_row = store::get_notification_settings_for_category(&conn, "email_arrived").unwrap();
    assert!(email_row.in_app_enabled);
    assert!(!email_row.os_toast_enabled, "email_arrived should default OS toast off");
}

#[test]
fn update_notification_settings_persists_and_creates_row_if_missing() {
    let conn = setup_test_db("update_settings");
    store::update_notification_settings(&conn, "email_arrived", true, true).unwrap();
    let row = store::get_notification_settings_for_category(&conn, "email_arrived").unwrap();
    assert!(row.os_toast_enabled);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test`
Expected: FAIL to compile.

- [ ] **Step 3: Implement the store functions**

In `store/mod.rs`, near Task 2's additions:

```rust
#[derive(Serialize, serde::Deserialize, Clone)]
pub struct NotificationSettingsRow {
    pub category: String,
    pub in_app_enabled: bool,
    pub os_toast_enabled: bool,
}

fn notification_settings_row_from_sql(row: &rusqlite::Row) -> rusqlite::Result<NotificationSettingsRow> {
    Ok(NotificationSettingsRow {
        category: row.get(0)?,
        in_app_enabled: row.get::<_, i64>(1)? != 0,
        os_toast_enabled: row.get::<_, i64>(2)? != 0,
    })
}

/// task_due defaults its OS toast on -- it's conceptually closest to the
/// existing meeting-reminder OS notification. Every other category
/// defaults in-app-only.
fn default_os_toast_enabled(category: &str) -> bool {
    category == "task_due"
}

pub fn ensure_notification_settings_row(conn: &Connection, category: &str) -> Result<(), rusqlite::Error> {
    let os_toast_default: i64 = if default_os_toast_enabled(category) { 1 } else { 0 };
    conn.execute(
        "INSERT OR IGNORE INTO notification_settings (category, in_app_enabled, os_toast_enabled) VALUES (?1, 1, ?2)",
        params![category, os_toast_default],
    )?;
    Ok(())
}

pub fn get_notification_settings_for_category(conn: &Connection, category: &str) -> Result<NotificationSettingsRow, rusqlite::Error> {
    conn.query_row(
        "SELECT category, in_app_enabled, os_toast_enabled FROM notification_settings WHERE category = ?1",
        params![category],
        notification_settings_row_from_sql,
    )
}

pub fn list_notification_settings(conn: &Connection) -> Result<Vec<NotificationSettingsRow>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT category, in_app_enabled, os_toast_enabled FROM notification_settings ORDER BY category")?;
    stmt.query_map([], notification_settings_row_from_sql)?.collect()
}

pub fn update_notification_settings(conn: &Connection, category: &str, in_app_enabled: bool, os_toast_enabled: bool) -> Result<(), rusqlite::Error> {
    ensure_notification_settings_row(conn, category)?;
    conn.execute(
        "UPDATE notification_settings SET in_app_enabled = ?1, os_toast_enabled = ?2 WHERE category = ?3",
        params![in_app_enabled as i64, os_toast_enabled as i64, category],
    )?;
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/store/mod.rs apps/desktop/src-tauri/tests/notifications_test.rs
git commit -m "feat(notifications): add per-category notification settings store functions"
```

---

## Task 4: `notifications::create` producer API + Tauri commands

**Files:**
- Create: `apps/desktop/src-tauri/src/notifications/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add `pub mod notifications;` to the module list at lines 4-25, register 5 new commands in `generate_handler![]` before its closing `])` at line 312)

**Interfaces:**
- Consumes: `store::insert_notification`, `store::get_notification`, `store::ensure_notification_settings_row`, `store::get_notification_settings_for_category`, `store::list_notifications`, `store::update_notification_status`, `store::snooze_notification`, `store::list_notification_settings`, `store::update_notification_settings` (Tasks 2-3).
- Produces: `pub struct NewNotification { pub category: String, pub title: String, pub body: String, pub click_target: Option<serde_json::Value> }`; `pub fn create(app: &AppHandle, new: NewNotification) -> Result<i64, String>` (used by Task 5's scanner and Task 6's email wiring); Tauri commands `list_notifications`, `update_notification_status`, `snooze_notification`, `get_notification_settings`, `update_notification_settings` (consumed by Task 7's frontend store).

**No automated test for this task.** `notifications::create` and the command wrappers are thin `AppHandle`-dependent orchestration around already-tested store functions (Tasks 2-3) — this matches the existing convention in this codebase (e.g. `calendar/reminder.rs::scan_and_notify` isn't unit-tested either; only its underlying store queries are). Verification is a compile check plus manual exercise once Task 9 wires up the frontend.

- [ ] **Step 1: Create the module**

```rust
// apps/desktop/src-tauri/src/notifications/mod.rs
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::store;

pub mod task_scanner;

pub struct NewNotification {
    pub category: String,
    pub title: String,
    pub body: String,
    pub click_target: Option<serde_json::Value>,
}

/// The entire integration surface a producer needs to raise a notification:
/// one function call, no direct SQL, no event-emitting boilerplate.
pub fn create(app: &AppHandle, new: NewNotification) -> Result<i64, String> {
    let conn = store::open_db(app)?;
    store::ensure_notification_settings_row(&conn, &new.category).map_err(|e| e.to_string())?;
    let settings = store::get_notification_settings_for_category(&conn, &new.category).map_err(|e| e.to_string())?;

    let click_target_json = new.click_target.as_ref().map(|v| v.to_string());
    let id = store::insert_notification(&conn, &new.category, &new.title, &new.body, click_target_json.as_deref())
        .map_err(|e| e.to_string())?;

    if settings.in_app_enabled {
        if let Ok(row) = store::get_notification(&conn, id) {
            let _ = app.emit("notification-created", &row);
        }
    }
    if settings.os_toast_enabled {
        let _ = app.notification().builder().title(&new.title).body(&new.body).show();
    }
    Ok(id)
}

#[tauri::command]
pub fn list_notifications(app: AppHandle, status_filter: Option<String>) -> Result<Vec<store::NotificationRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_notifications(&conn, status_filter.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_notification_status(app: AppHandle, id: i64, status: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_notification_status(&conn, id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snooze_notification(app: AppHandle, id: i64, until: String) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::snooze_notification(&conn, id, &until).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_notification_settings(app: AppHandle) -> Result<Vec<store::NotificationSettingsRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_notification_settings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_notification_settings(app: AppHandle, category: String, in_app_enabled: bool, os_toast_enabled: bool) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_notification_settings(&conn, &category, in_app_enabled, os_toast_enabled).map_err(|e| e.to_string())
}
```

Note: `pub mod task_scanner;` is declared here now so the module compiles once Task 5 adds `task_scanner.rs` — create an empty placeholder file now so Step 3 (`cargo check`) below passes:

```rust
// apps/desktop/src-tauri/src/notifications/task_scanner.rs (placeholder, filled in by Task 5)
```

- [ ] **Step 2: Register the module and commands in `lib.rs`**

Add to the `pub mod ...;` list (lines 4-25):

```rust
pub mod notifications;
```

Add to `generate_handler![...]` before its closing `])` (line 312), following the existing `// <module>` comment-header convention:

```rust
    // notifications (ASC-123)
    notifications::list_notifications,
    notifications::update_notification_status,
    notifications::snooze_notification,
    notifications::get_notification_settings,
    notifications::update_notification_settings
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors.

- [ ] **Step 4: Run the full existing test suite to confirm no regression**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS (existing tests + Task 1-3's `notifications_test.rs`).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/notifications/ apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(notifications): add notifications::create producer API and Tauri commands"
```

---

## Task 5: Task-due background scanner

**Files:**
- Modify: `apps/desktop/src-tauri/src/store/mod.rs` (add `list_tasks_with_due_date`)
- Modify: `apps/desktop/src-tauri/src/notifications/task_scanner.rs` (replace Task 4's placeholder)
- Modify: `apps/desktop/src-tauri/src/lib.rs` (spawn the background loop in `.setup()`, lines 75-100, alongside the existing calendar reminder spawn)
- Test: `apps/desktop/src-tauri/tests/notifications_test.rs` (extend, pure-function test — no DB/AppHandle needed)

**Interfaces:**
- Consumes: `notifications::create`, `NewNotification` (Task 4); `store::TaskRow` (existing).
- Produces: `pub fn tasks_entering_window(all_tasks: &[store::TaskRow], today: &str) -> Vec<store::TaskRow>`; `pub async fn scan_due_tasks_background(app: AppHandle)`.

- [ ] **Step 1: Write the failing test**

Append to `apps/desktop/src-tauri/tests/notifications_test.rs`:

```rust
use tauri_app_lib::notifications::task_scanner::tasks_entering_window;
use tauri_app_lib::store::TaskRow;

fn sample_task(id: i64, due_date: Option<&str>) -> TaskRow {
    TaskRow {
        id,
        case_id: 1,
        title: "T".to_string(),
        description: None,
        status: "Waiting".to_string(),
        estimate_value: None,
        estimate_unit: None,
        due_date: due_date.map(|s| s.to_string()),
        task_template_item_id: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: None,
        sort_order: 0,
    }
}

#[test]
fn tasks_entering_window_includes_today_and_overdue_excludes_future_and_none() {
    let tasks = vec![
        sample_task(1, Some("2026-08-25")), // due today
        sample_task(2, Some("2026-08-20")), // overdue
        sample_task(3, Some("2026-09-01")), // future -- excluded
        sample_task(4, None),               // no due date -- excluded
    ];
    let due = tasks_entering_window(&tasks, "2026-08-25");
    assert_eq!(due.iter().map(|t| t.id).collect::<Vec<_>>(), vec![1, 2]);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test notifications_test tasks_entering_window`
Expected: FAIL to compile (`task_scanner::tasks_entering_window` doesn't exist yet — Task 4 only left a placeholder file).

- [ ] **Step 3: Add `list_tasks_with_due_date` to `store/mod.rs`**

Near `list_tasks_for_case`:

```rust
pub fn list_tasks_with_due_date(conn: &Connection) -> Result<Vec<TaskRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, case_id, title, description, status, estimate_value, estimate_unit, due_date, task_template_item_id, created_at, updated_at, sort_order
         FROM tasks WHERE due_date IS NOT NULL"
    )?;
    stmt.query_map([], task_row_from_sql)?.collect()
}
```

- [ ] **Step 4: Implement `task_scanner.rs`**

```rust
// apps/desktop/src-tauri/src/notifications/task_scanner.rs
use std::collections::HashSet;
use tauri::AppHandle;

use crate::store::{self, TaskRow};
use super::{create, NewNotification};

pub const TASK_SCAN_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

/// A task enters the notification window once its due_date's calendar day
/// has arrived or passed. due_date is a plain "YYYY-MM-DD" string (set via
/// a native <input type="date">, no time component -- see MeetingForm.tsx/
/// TaskForm.tsx), so lexicographic string comparison against today's date
/// matches chronological order, the same trick calendar/reminder.rs uses
/// for RFC3339 timestamps.
pub fn tasks_entering_window(all_tasks: &[TaskRow], today: &str) -> Vec<TaskRow> {
    all_tasks
        .iter()
        .filter(|t| matches!(&t.due_date, Some(d) if d.as_str() <= today))
        .cloned()
        .collect()
}

/// Independent loop from every other poller (calendar sync, email ingestion)
/// -- a slow/failing call elsewhere must never delay this one, same reasoning
/// calendar/reminder.rs's header comment states for its own independence.
pub async fn scan_due_tasks_background(app: AppHandle) {
    let mut interval = tokio::time::interval(TASK_SCAN_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut notified: HashSet<i64> = HashSet::new();
    loop {
        interval.tick().await;
        if let Err(e) = scan_and_notify(&app, &mut notified) {
            println!("[Task Scanner Error] {e}");
        }
    }
}

fn scan_and_notify(app: &AppHandle, notified: &mut HashSet<i64>) -> Result<(), String> {
    let conn = store::open_db(app)?;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let all_tasks = store::list_tasks_with_due_date(&conn).map_err(|e| e.to_string())?;
    let due = tasks_entering_window(&all_tasks, &today);

    // Drop ids that fell out of the window (completed, due date moved, or
    // deleted) so `notified` doesn't grow without bound in a long session --
    // same convention as calendar/reminder.rs::notified.
    notified.retain(|id| due.iter().any(|t| t.id == *id));

    for task in due {
        if notified.insert(task.id) {
            let _ = create(
                app,
                NewNotification {
                    category: "task_due".to_string(),
                    title: format!("Task due: {}", task.title),
                    body: task.description.clone().unwrap_or_default(),
                    click_target: Some(serde_json::json!({
                        "route": format!("/case-management/cases/{}", task.case_id)
                    })),
                },
            );
        }
    }
    Ok(())
}
```

- [ ] **Step 5: Spawn the loop in `lib.rs`'s `.setup()`**

Add alongside the existing calendar reminder spawn (lines 88-93):

```rust
    let handle_task_scanner = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        crate::notifications::task_scanner::scan_due_tasks_background(handle_task_scanner).await;
    });
```

- [ ] **Step 6: Run tests to verify they pass, then the full suite**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS (all tests, no regressions).

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors (confirms the `lib.rs` spawn wiring compiles).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/store/mod.rs apps/desktop/src-tauri/src/notifications/task_scanner.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/notifications_test.rs
git commit -m "feat(notifications): add task-due background scanner"
```

---

## Task 6: Wire the email-arrived producer

**Files:**
- Modify: `apps/desktop/src-tauri/src/email/emails_orchestrate.rs:320` (inside `apply_pipeline_outcome`, right after the existing `let _ = app.emit("new-email-alert", ());`)

**Interfaces:**
- Consumes: `notifications::create`, `NewNotification` (Task 4).

**No automated test.** `apply_pipeline_outcome` is `AppHandle`-dependent orchestration; the existing test suite in this file (`emails_orchestrate.rs`'s `#[cfg(test)] mod tests`) already only tests the pure `EmailPipelineResult`/matching logic, not `apply_pipeline_outcome` itself — this task follows that same existing boundary. Verified manually once the app runs end-to-end (Task 9+).

- [ ] **Step 1: Add the `notifications::create` call**

In `apps/desktop/src-tauri/src/email/emails_orchestrate.rs`, inside `apply_pipeline_outcome`'s `if result.should_surface_alert() { ... }` block (this is the *only* outcome that should notify — the other branch is silently-ignored spam/marketing and must stay silent):

```rust
        let _ = app.emit("new-email-alert", ());

        let _ = crate::notifications::create(
            app,
            crate::notifications::NewNotification {
                category: "email_arrived".to_string(),
                title: "New email awaiting review".to_string(),
                body: format!("{} — {}", email.sender, email.subject),
                click_target: Some(serde_json::json!({
                    "route": "/case-management",
                    "windowEvent": "open-email-alert-review"
                })),
            },
        );

        return Ok(());
```

- [ ] **Step 2: Verify it compiles and existing tests still pass**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors.

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS, including `emails_orchestrate.rs`'s existing `pipeline_result_surfaces_alert_when_matched` and sibling tests (unaffected by this change).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/email/emails_orchestrate.rs
git commit -m "feat(notifications): wire email-arrived notifications into the ingestion pipeline"
```

---

## Task 7: Frontend notification store

**Files:**
- Create: `apps/desktop/src/store/notificationStore.ts`

**Interfaces:**
- Consumes: Tauri commands `list_notifications`, `update_notification_status`, `snooze_notification` (Task 4).
- Produces: `notificationsAtom: Atom<Notification[]>`, `unreadCountAtom: Atom<number>`, `loadNotifications(): Promise<void>`, `upsertNotification(row: Notification): void`, `updateNotificationStatus(id: number, status: NotificationStatus): Promise<void>`, `snoozeNotification(id: number, until: string): Promise<void>`, `parseClickTarget(raw: string | null): NotificationClickTarget | null`, types `Notification`, `NotificationStatus`, `NotificationClickTarget` (all consumed by Task 8).

**No automated test** (no frontend test runner, see Global Constraints). Verified via `npx tsc --noEmit` now, functionally in Task 8 once `NotificationBell` consumes it.

- [ ] **Step 1: Implement the store**

```ts
// apps/desktop/src/store/notificationStore.ts
import { atom, getDefaultStore } from "jotai";
import { invoke } from "@tauri-apps/api/core";

export interface NotificationClickTarget {
  route?: string;
  windowEvent?: string;
}

export type NotificationStatus = "unread" | "read" | "closed" | "deleted";

// Mirrors the Rust NotificationRow struct's wire shape as-is (snake_case),
// same convention as Task/TaskWithCase in lib/task/types.ts.
export interface Notification {
  id: number;
  category: string;
  title: string;
  body: string;
  click_target: string | null;
  status: NotificationStatus;
  created_at: string;
  snooze_until: string | null;
}

export function parseClickTarget(raw: string | null): NotificationClickTarget | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NotificationClickTarget;
  } catch {
    return null;
  }
}

export const notificationsAtom = atom<Notification[]>([]);
export const unreadCountAtom = atom((get) => get(notificationsAtom).filter((n) => n.status === "unread").length);

export async function loadNotifications(): Promise<void> {
  const rows = await invoke<Notification[]>("list_notifications", { statusFilter: null });
  getDefaultStore().set(notificationsAtom, rows);
}

export function upsertNotification(row: Notification): void {
  const store = getDefaultStore();
  const withoutRow = store.get(notificationsAtom).filter((n) => n.id !== row.id);
  store.set(notificationsAtom, [row, ...withoutRow]);
}

// Closing or deleting both remove a notification from this "active" list --
// "closed but still retrievable" is served separately (NotificationPanel's
// closed tab fetches list_notifications({ statusFilter: "closed" }) fresh
// on demand, Task 8), not by keeping closed rows in this atom.
export async function updateNotificationStatus(id: number, status: NotificationStatus): Promise<void> {
  await invoke("update_notification_status", { id, status });
  const store = getDefaultStore();
  store.set(notificationsAtom, store.get(notificationsAtom).filter((n) => n.id !== id));
}

export async function snoozeNotification(id: number, until: string): Promise<void> {
  await invoke("snooze_notification", { id, until });
  const store = getDefaultStore();
  store.set(notificationsAtom, store.get(notificationsAtom).filter((n) => n.id !== id));
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/store/notificationStore.ts
git commit -m "feat(notifications): add frontend notification store"
```

---

## Task 8: `NotificationBell` + `NotificationPanel`

**Files:**
- Create: `apps/desktop/src/components/Notifications/NotificationBell.tsx`
- Create: `apps/desktop/src/components/Notifications/NotificationPanel.tsx`

**Interfaces:**
- Consumes: `notificationsAtom`, `unreadCountAtom`, `loadNotifications`, `upsertNotification`, `updateNotificationStatus`, `snoozeNotification`, `parseClickTarget`, `Notification` type (Task 7); Tauri command `list_notifications` directly (for the closed-tab fetch, Task 4); event `notification-created` (Task 4).
- Produces: `export default function NotificationBell(): JSX.Element` (consumed by Task 9's `AppShell`).

**No automated test.** Verified via `npx tsc --noEmit` now; full functional verification happens in Task 9 once `NotificationBell` is actually mounted in the running app.

- [ ] **Step 1: Implement `NotificationBell.tsx`**

```tsx
// apps/desktop/src/components/Notifications/NotificationBell.tsx
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { listen } from "@tauri-apps/api/event";
import { Bell } from "lucide-react";
import { unreadCountAtom, loadNotifications, upsertNotification, type Notification } from "@/store/notificationStore";
import NotificationPanel from "./NotificationPanel";

export default function NotificationBell() {
  const unreadCount = useAtomValue(unreadCountAtom);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadNotifications().catch((err) => console.error("[NotificationBell] Failed to load notifications:", err));
    const unlisten = listen<Notification>("notification-created", (event) => {
      upsertNotification(event.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="relative bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-4 shadow-xl transition-all hover:scale-105 duration-200 cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      )}
      {isOpen && <NotificationPanel onClose={() => setIsOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Implement `NotificationPanel.tsx`**

Snooze dropdown and the whole panel follow the hand-rolled `useState(open)` + outside-click overlay pattern already established in `components/ui/KebabMenu.tsx` (no Popover primitive exists in this codebase):

```tsx
// apps/desktop/src/components/Notifications/NotificationPanel.tsx
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import {
  notificationsAtom,
  parseClickTarget,
  updateNotificationStatus,
  snoozeNotification,
  type Notification,
} from "@/store/notificationStore";

interface NotificationPanelProps {
  onClose: () => void;
}

const SNOOZE_PRESETS: { label: string; getUntil: () => Date }[] = [
  { label: "1 hour", getUntil: () => new Date(Date.now() + 60 * 60 * 1000) },
  {
    label: "Tomorrow morning",
    getUntil: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Next week",
    getUntil: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    },
  },
];

function SnoozeMenu({ onPick }: { onPick: (until: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
        Snooze
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 w-40 rounded-lg border border-border bg-card shadow-lg py-1 z-40">
            {SNOOZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(preset.getUntil());
                }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const notifications = useAtomValue(notificationsAtom);
  const navigate = useNavigate();
  const [statusView, setStatusView] = useState<"active" | "closed">("active");
  const [closedNotifications, setClosedNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (statusView !== "closed") return;
    invoke<Notification[]>("list_notifications", { statusFilter: "closed" })
      .then(setClosedNotifications)
      .catch((err) => console.error("[NotificationPanel] Failed to load closed notifications:", err));
  }, [statusView]);

  const visible = statusView === "active" ? notifications : closedNotifications;

  function handleClickBody(n: Notification) {
    updateNotificationStatus(n.id, "read").catch((err) => console.error(err));
    const target = parseClickTarget(n.click_target);
    if (target?.route) navigate(target.route);
    if (target?.windowEvent) window.dispatchEvent(new CustomEvent(target.windowEvent));
    onClose();
  }

  return (
    <div className="bg-card border border-border rounded-2xl w-96 shadow-2xl max-h-[500px] flex flex-col overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between shrink-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatusView("active")}
            className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${statusView === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusView("closed")}
            className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${statusView === "closed" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Closed
          </button>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground cursor-pointer">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {visible.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">No notifications</div>}
        {visible.map((n) => (
          <div key={n.id} className="p-3 flex flex-col gap-1.5">
            <button type="button" onClick={() => handleClickBody(n)} className="text-left cursor-pointer">
              <div className="text-sm font-semibold text-foreground">{n.title}</div>
              <div className="text-xs text-muted-foreground">{n.body}</div>
            </button>
            {statusView === "active" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateNotificationStatus(n.id, "closed")}
                  className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => updateNotificationStatus(n.id, "deleted")}
                  className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Delete
                </button>
                <SnoozeMenu onPick={(until) => snoozeNotification(n.id, until.toISOString())} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/Notifications/
git commit -m "feat(notifications): add NotificationBell and NotificationPanel"
```

---

## Task 9: `AppShell` + `App.tsx` wiring

**Files:**
- Create: `apps/desktop/src/components/App/AppShell.tsx`
- Modify: `apps/desktop/src/App.tsx` (lines 77-93: wrap the existing three-way `checkingSession`/`gated`/normal branch in `<AppShell>`; remove the now-redundant direct `<UpdateBanner />` line and its now-unused import)

**Interfaces:**
- Consumes: `sessionAtom`, `sessionStatusAtom` (`store/authStore.ts`, existing); `NotificationBell` (Task 8); `UpdateBanner` (existing, `components/Updater/UpdateBanner.tsx`).

**No automated test.** Verified via `npx tsc --noEmit`, then running the app (`debug`/`run` skill): confirm `UpdateBanner` still behaves identically to before (including during the login screen), and the bell now appears bottom-right only once actually logged in — not during the loading spinner or login screen.

- [ ] **Step 1: Implement `AppShell.tsx`**

```tsx
// apps/desktop/src/components/App/AppShell.tsx
import { useAtomValue } from "jotai";
import { sessionAtom, sessionStatusAtom } from "@/store/authStore";
import UpdateBanner from "@/components/Updater/UpdateBanner";
import NotificationBell from "@/components/Notifications/NotificationBell";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const session = useAtomValue(sessionAtom);
  const sessionStatus = useAtomValue(sessionStatusAtom);
  const showBell = sessionStatus === "ready" && session !== null;

  return (
    <div className="relative h-screen">
      <UpdateBanner />
      {showBell && <NotificationBell />}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

Replace the current return block (lines 77-93):

```tsx
// before
return (
  <LanguageProvider>
    <FontProvider>
      <UpdateBanner />
      {checkingSession ? (
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
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

```tsx
// after
return (
  <LanguageProvider>
    <FontProvider>
      <AppShell>
        {checkingSession ? (
          <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
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

Add the import: `import AppShell from "./components/App/AppShell";`
Remove the now-unused direct import: `import UpdateBanner from "./components/Updater/UpdateBanner";` (still imported and used inside `AppShell.tsx` itself, just no longer from `App.tsx`).

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no errors, no unused-import warnings.

- [ ] **Step 4: Manual verification**

Run the app (`debug`/`run` skill). Confirm: (a) the update banner still appears/behaves exactly as before, including on the login screen; (b) no bell appears while the session is loading or while logged out; (c) the bell appears bottom-right once logged in.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/App/AppShell.tsx apps/desktop/src/App.tsx
git commit -m "feat(notifications): add AppShell hosting UpdateBanner and NotificationBell"
```

---

## Task 10: `DateTimePicker` + custom snooze

**Files:**
- Create: `apps/desktop/src/components/ui/DateTimePicker.tsx`
- Modify: `apps/desktop/src/components/Notifications/NotificationPanel.tsx` (add a "Custom…" entry to `SnoozeMenu`, opening `DateTimePicker`)

**Interfaces:**
- Consumes: `date-fns` (existing dependency); `snoozeNotification` (Task 7).
- Produces: `export default function DateTimePicker(props: { value: Date | null; onChange: (date: Date) => void; minDate?: Date; placeholder?: string }): JSX.Element`.

**No automated test.** Verified via `npx tsc --noEmit` and manual app run: open the "Custom…" snooze option, pick a date/time before now (should be rejected/disabled), pick a valid future date/time, confirm the notification disappears from the active list until that time.

- [ ] **Step 1: Implement `DateTimePicker.tsx`**

Uses the same date+time-combining logic as `MeetingForm.tsx`'s `toDateInputValue`/`toTimeInputValue`/`combine` helpers, and the same hand-rolled trigger+overlay dropdown pattern as `KebabMenu.tsx` (no Popover primitive exists in this codebase):

```tsx
// apps/desktop/src/components/ui/DateTimePicker.tsx
import { useState } from "react";
import { format } from "date-fns";

interface DateTimePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minDate?: Date;
  placeholder?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function combine(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}`);
}

export default function DateTimePicker({ value, onChange, minDate, placeholder }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const base = value ?? new Date();
  const [dateStr, setDateStr] = useState(toDateInputValue(base));
  const [timeStr, setTimeStr] = useState(toTimeInputValue(base));

  const candidate = combine(dateStr, timeStr);
  const isInvalid = minDate ? candidate < minDate : false;

  function confirm() {
    if (isInvalid) return;
    onChange(candidate);
    setOpen(false);
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted cursor-pointer"
      >
        {value ? format(value, "MMM d, yyyy HH:mm") : (placeholder ?? "Pick date & time")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 w-56 rounded-lg border border-border bg-card shadow-lg p-3 z-40 flex flex-col gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-input bg-background"
            />
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-input bg-background"
            />
            {isInvalid && <div className="text-[10px] text-destructive">Must be in the future</div>}
            <button
              type="button"
              onClick={confirm}
              disabled={isInvalid}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire "Custom…" into `NotificationPanel.tsx`'s `SnoozeMenu`**

```tsx
// NotificationPanel.tsx — add import
import DateTimePicker from "@/components/ui/DateTimePicker";

// SnoozeMenu — add state and a Custom… row inside the open dropdown, after the SNOOZE_PRESETS.map(...) block:
function SnoozeMenu({ onPick }: { onPick: (until: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
        Snooze
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 w-40 rounded-lg border border-border bg-card shadow-lg py-1 z-40">
            {SNOOZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(preset.getUntil());
                }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
            <div className="px-3 py-1.5">
              <DateTimePicker
                value={null}
                minDate={new Date()}
                placeholder="Custom…"
                onChange={(until) => {
                  setOpen(false);
                  onPick(until);
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the app. Open a notification's snooze menu, use "Custom…", confirm a past time is rejected and a future time snoozes the notification correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ui/DateTimePicker.tsx apps/desktop/src/components/Notifications/NotificationPanel.tsx
git commit -m "feat(notifications): add DateTimePicker and wire custom snooze"
```

---

## Task 11: Retire the email-alert floating trigger

**Files:**
- Modify: `apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementEmailAlertReview.tsx` (delete only the `{!isOpen && (<button ...>)}` bouncing-trigger block within the `fixed bottom-6 right-6 z-50` wrapper at line 155; everything else — `isOpen` state, the `open-email-alert-review` listener, the slide-out panel, the `alerts.length === 0` early return — is untouched)

**Interfaces:**
- Consumes: nothing new — this task only deletes JSX. `click_target.windowEvent === "open-email-alert-review"` (Task 6/8) already drives this component's existing, unmodified `window.addEventListener("open-email-alert-review", ...)` listener.

**No automated test.** Verified via `npx tsc --noEmit` and manual app run: with a pending email alert present, confirm no floating button appears at bottom-right (only the bell does), and clicking the corresponding "email awaiting review" notification in `NotificationPanel` still opens this component's panel correctly.

- [ ] **Step 1: Delete the floating trigger button**

In `CaseManagementEmailAlertReview.tsx`, remove the `{!isOpen && ( <button onClick={() => setIsOpen(true)} ...>✉ {alerts.length} Incoming Emails</button> )}` block. Leave the surrounding `<div className="fixed bottom-6 right-6 z-50">` wrapper and the `{isOpen && (...)}` panel block exactly as they are — the panel still needs that positioning when it's open, and it's a momentary overlay (not always-on chrome), so it doesn't visually compete with `NotificationBell` occupying that same corner while closed.

- [ ] **Step 2: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no errors, no unused-variable warnings (double-check `setIsOpen`/`isOpen` are still referenced by the remaining panel-open logic and the `open-email-alert-review` listener — they are).

- [ ] **Step 3: Manual verification**

Run the app with at least one pending email alert. Confirm: (a) no bouncing button appears — only the notification bell is visible bottom-right; (b) clicking the matching "email awaiting review" entry in the bell's panel opens `CaseManagementEmailAlertReview`'s slide-out panel correctly, same as the old button used to.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/CaseManagement/CaseManagementOpenCases/CaseManagementEmailAlertReview.tsx
git commit -m "feat(notifications): retire the ad-hoc email-alert floating trigger"
```

---

## Task 12: Notifications settings tab

**Files:**
- Modify: `apps/desktop/src/components/Settings/SettingMenuTab.tsx` (add `"notifications"` to the `TabType` union, add a `Bell`-icon `SettingMenuTabItem`)
- Modify: `apps/desktop/src/components/Settings/Settings.tsx` (add the `case "notifications":` render branch)
- Create: `apps/desktop/src/components/Settings/SettingNotifications.tsx`

**Interfaces:**
- Consumes: Tauri commands `get_notification_settings`, `update_notification_settings` (Task 4).

**No automated test.** Verified via `npx tsc --noEmit` and manual app run: open Settings → Notifications, confirm rows for `email_arrived` and `task_due` (both auto-created the first time each producer has run — Task 3's `ensure_notification_settings_row`), toggle each, confirm persistence across a reload.

- [ ] **Step 1: Add the tab entry**

In `SettingMenuTab.tsx`, update the import and union:

```tsx
import { User, Mail, Server, RefreshCw, Mic, Users, Bell } from "lucide-react";
export type TabType = "preferences" | "email" | "ai" | "voice" | "users_roles" | "update" | "notifications";
```

Add a new `SettingMenuTabItem`, e.g. after the "Users and Roles" entry:

```tsx
<SettingMenuTabItem
  isActive={activeTab === "notifications"}
  onClick={() => handleTabChange("notifications")}
  icon={Bell}
  label="Notifications"
/>
```

- [ ] **Step 2: Add the render branch in `Settings.tsx`**

Following the simplest existing precedent (`SettingUsersRoles`, a bare no-props component):

```tsx
import SettingNotifications from "./SettingNotifications";

// in the render-switch function, alongside the existing case "users_roles": return <SettingUsersRoles />;
case "notifications":
  return <SettingNotifications />;
```

- [ ] **Step 3: Implement `SettingNotifications.tsx`**

```tsx
// apps/desktop/src/components/Settings/SettingNotifications.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NotificationSettingsRow {
  category: string;
  in_app_enabled: boolean;
  os_toast_enabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  email_arrived: "Email arrived",
  task_due: "Task due",
  ai_credit_low: "AI credit low",
};

export default function SettingNotifications() {
  const [rows, setRows] = useState<NotificationSettingsRow[]>([]);

  useEffect(() => {
    invoke<NotificationSettingsRow[]>("get_notification_settings")
      .then(setRows)
      .catch((err) => console.error("[SettingNotifications] Failed to load settings:", err));
  }, []);

  async function toggle(category: string, field: "in_app_enabled" | "os_toast_enabled") {
    const row = rows.find((r) => r.category === category);
    if (!row) return;
    const updated = { ...row, [field]: !row[field] };
    setRows(rows.map((r) => (r.category === category ? updated : r)));
    await invoke("update_notification_settings", {
      category,
      inAppEnabled: updated.in_app_enabled,
      osToastEnabled: updated.os_toast_enabled,
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.category} className="flex items-center justify-between border border-border rounded-lg p-3">
            <span className="text-sm text-foreground">{CATEGORY_LABELS[row.category] ?? row.category}</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={row.in_app_enabled} onChange={() => toggle(row.category, "in_app_enabled")} />
                In-app
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={row.os_toast_enabled} onChange={() => toggle(row.category, "os_toast_enabled")} />
                OS toast
              </label>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No notification categories yet — settings appear here the first time each type of notification has fired at least once.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run the app. Trigger at least one email-arrived or task-due notification first (so its settings row exists), then open Settings → Notifications, toggle both switches for a category, reload the app, confirm the toggles persisted.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/Settings/SettingMenuTab.tsx apps/desktop/src/components/Settings/Settings.tsx apps/desktop/src/components/Settings/SettingNotifications.tsx
git commit -m "feat(notifications): add Notifications settings tab"
```
