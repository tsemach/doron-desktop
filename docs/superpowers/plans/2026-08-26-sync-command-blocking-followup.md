# Offload Remaining Sync Tauri Commands Off the Main IPC Thread — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move real blocking work (SQLite scans/joins, filesystem reads/writes, ZIP archives, subprocess spawns) out of plain `pub fn` Tauri commands, which run inline on the main IPC/event-loop thread by default — a more direct freeze than the async-worker-pool version already fixed in the prior plan.

**Architecture:** Reuse `crate::blocking::run_blocking` (shipped in PR #229, already merged to `master`) at 34 more call sites identified by a full audit of every plain `pub fn` `#[tauri::command]` in `apps/desktop/src-tauri/src`. Each fix follows the exact split pattern already established for `case::save_case_document_fields`/`case::create_new_case`: convert the command to `pub async fn`, move its synchronous body into a private `..._blocking` helper (or, for one-line delegations, inline the closure directly), and call it via `crate::blocking::run_blocking(move || { ... }).await`. One task additionally deduplicates two independent, near-identical "load all active cases" queries while fixing them (Task 4). No behavior change anywhere else — this is a threading-placement pass, identical in spirit and method to the already-shipped plan.

**Tech Stack:** Rust, Tokio (via `tauri::async_runtime`), rusqlite. No new dependencies.

**Spec:** `docs/performance-review/asc-189-sync-command-audit.md` — the full audit (83 commands read directly, 34 classified FIX, 49 TRIVIAL, 0 UNCLEAR) that this plan implements. That audit itself follows on `docs/performance-review/asc-189-desktop-performance-investigation.md` (the original ASC-189 investigation — note: neither of these two files is committed to this repo's history as of this plan; both are working documents in the primary checkout's working tree, not `git log`-visible. This plan's own copy of the audit, committed alongside it, is the durable record) and the already-shipped plan `docs/superpowers/plans/2026-08-26-tauri-spawn-blocking.md` (PR #229, merged — introduces `crate::blocking::run_blocking` and the split pattern this plan reuses at every call site).

## Global Constraints

- No behavior change: every refactored function must return the exact same `Ok`/`Err` values it does today for the same inputs. This is a threading-placement change, not a logic change — the sole intentional exception is Task 4's query deduplication, which is verified query-equivalent before being merged (see Task 4's own note).
- Reuse `crate::blocking::run_blocking` (already shipped in `apps/desktop/src-tauri/src/blocking.rs`) — do not create a second helper or use raw `tokio::task::spawn_blocking`.
- Do not introduce new test-mocking infrastructure (e.g. `tauri::test::mock_app`) — it does not exist in this codebase today, and every command here needs `AppHandle`. Per the precedent set by the already-shipped plan's Tasks 4/5, verification for functions with no automated test is `cargo check`/`cargo build` plus a manual smoke test; do not add one as a side effect of this plan.
- Preserve all existing comments; adjust wording only where the code they describe materially changed.
- Do not attempt to eliminate the N+1 query patterns this audit found (calendar attendees, case-template doc-links) — wrap the existing query as-is in `run_blocking`. Query-shape improvements are explicitly out of scope for this plan (see the audit's own recommendation) and should be filed separately if wanted.

## Task Ordering — read before executing out of order

Three pairs of tasks touch the **same file** at different line ranges, and one task's edit changes that file's line count before the other task's line numbers were read. Editing the *later*-in-file range first avoids invalidating the *earlier* task's cited line numbers. **Execute the tasks in the numbered order below** (not the module-alphabetical order you might otherwise expect) — this is already reflected in the task numbers 1–9:

- Task 1 (`doc_template/mod.rs:697-800`) must run **before** Task 2 (`doc_template/mod.rs:467-508`) — Task 1's edits are later in the file.
- Task 3 (`case/mod.rs:405-802`) must run **before** Task 4 (`case/mod.rs:63-107`) — Task 3's edits are later in the file.
- Task 5 (`task/mod.rs:74-78`) must run **before** Task 6 (`task/mod.rs:68-72`) — Task 5's edit is later in the file.

Regardless of ordering, every task's implementer should re-read the exact current file contents before editing (each task says so individually) rather than trusting these line numbers blindly — they were accurate as of this plan's drafting, against the post-PR-#229 `master`.

---

## File Structure

- **Modify:** `apps/desktop/src-tauri/src/doc_template/mod.rs` — `open_path`/`delete_template` (Task 1), then `sync_template_fields`/`sync_all_templates_fields` (Task 2).
- **Modify:** `apps/desktop/src-tauri/src/doc_template/context.rs` — `get_template_field_context` (Task 2).
- **Modify:** `apps/desktop/src-tauri/src/case/mod.rs` — `list_case_files`/`add_file_to_case`/`save_case_fields`/`remove_file_from_case`/`read_file_bytes` (Task 3), then `list_cases` (Task 4).
- **Modify:** `apps/desktop/src-tauri/src/case/annotations.rs` — `set_case_annotations` (Task 3).
- **Modify:** `apps/desktop/src-tauri/src/case/lookup.rs` — new shared `load_active_cases_async`, `resolve_cases_for_paths`, `search_cases` (Task 4).
- **Modify:** `apps/desktop/src-tauri/src/task/mod.rs` — `list_all_tasks` (Task 5), then `reorder_tasks` (Task 6).
- **Modify:** `apps/desktop/src-tauri/src/tags/mod.rs` — `list_tag_values`/`list_all_tag_names` (Task 5).
- **Modify:** `apps/desktop/src-tauri/src/case_template/mod.rs` — `list_case_templates`/`create_case_template`/`update_case_template` (Task 6).
- **Modify:** `apps/desktop/src-tauri/src/task_template/mod.rs` — `create_task_template`/`update_task_template` (Task 6).
- **Modify:** `apps/desktop/src-tauri/src/calendar/mod.rs` — `list_meetings_for_range`/`list_meetings_for_case`/`list_todays_meetings` (Task 7).
- **Modify:** `apps/desktop/src-tauri/src/documents/versioning.rs` — `list_document_versions`/`restore_document_version`/`delete_document_version` (Task 8).
- **Modify:** `apps/desktop/src-tauri/src/email/emails_alerts.rs`, `email/emails_ops.rs` — 5 commands (Task 9).

---

### Task 1: Template file-open and delete offload

**Files:**
- Modify: `apps/desktop/src-tauri/src/doc_template/mod.rs:697-701` (`open_path`)
- Modify: `apps/desktop/src-tauri/src/doc_template/mod.rs:775-800` (`delete_template`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking` (shipped in PR #229, `apps/desktop/src-tauri/src/blocking.rs`)

**Note on scope for `open_path`:** `open_path_impl` (the private helper `open_path` delegates to) has exactly one platform-conditional block: `#[cfg(target_os = "linux")]` wraps a call to `try_open_via_wsl`, which is only compiled in on Linux. There is no separate Windows-specific branch — on Windows and macOS (and on Linux when WSL detection fails or errors), the code falls through to the single universal `app.opener().open_path(...)` call from `tauri_plugin_opener`. Both the WSL subprocess spawns (`wslpath`, `powershell.exe`, `wslview`) and the opener-plugin call are genuinely blocking, so the correct scope is the *whole* `open_path_impl` body in one `run_blocking` closure, not a per-branch wrap. This means no cross-compilation check is needed: the `#[cfg]` gate is resolved by the compiler per-target exactly as today — `run_blocking`'s closure compiles to whatever `open_path_impl`'s body compiles to on that target, unchanged by this refactor.

- [ ] **Step 1: Fix `open_path`**

Current code (`apps/desktop/src-tauri/src/doc_template/mod.rs:697-714`):

```rust
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    println!("[open_path] Attempting to open path: {}", path);
    open_path_impl(&app, &path)
}

fn open_path_impl(app: &AppHandle, path: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if try_open_via_wsl(path).is_ok() {
            return Ok(());
        }
    }

    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| format!("Failed to open file: {e}"))
}
```

`try_open_via_wsl` (`apps/desktop/src-tauri/src/doc_template/mod.rs:717-773`) is unchanged by this task — it's already a private, non-`#[tauri::command]` sync function; it just needs to keep being callable from inside `open_path_impl`'s body wherever that body now runs. Leave it exactly as-is.

Replace `open_path` with:

```rust
#[tauri::command]
pub async fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    println!("[open_path] Attempting to open path: {}", path);
    // WSL subprocess spawns (wslpath/powershell.exe/wslview) and the opener-plugin
    // call below are both genuinely blocking (process spawn+wait, or a synchronous
    // OS "open with default app" call) -- run on the blocking pool so a slow file
    // association or a stuck subprocess doesn't stall every other in-flight command.
    crate::blocking::run_blocking(move || open_path_impl(&app, &path)).await
}
```

`open_path_impl` itself (lines 703-714) does not need to change at all — it stays a plain sync `fn` taking `&AppHandle, &str`; `run_blocking`'s closure calls it by reference against the owned `app`/`path` it captured.

- [ ] **Step 2: Fix `delete_template`**

Current code (`apps/desktop/src-tauri/src/doc_template/mod.rs:775-800`):

```rust
#[tauri::command]
pub fn delete_template(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT original_path, marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let (original_path_str, marked_path_str): (String, String) = stmt
        .query_row(rusqlite::params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Failed to find template with ID {id}: {e}"))?;

    let orig_path = std::path::Path::new(&original_path_str);
    if orig_path.exists() {
        let _ = std::fs::remove_file(orig_path);
    }
    let marked_path = std::path::Path::new(&marked_path_str);
    if marked_path.exists() {
        let _ = std::fs::remove_file(marked_path);
    }

    conn.execute("DELETE FROM doc_templates WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn delete_template(app: AppHandle, id: i64) -> Result<(), String> {
    crate::blocking::run_blocking(move || delete_template_blocking(app, id)).await
}

fn delete_template_blocking(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT original_path, marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let (original_path_str, marked_path_str): (String, String) = stmt
        .query_row(rusqlite::params![id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Failed to find template with ID {id}: {e}"))?;

    let orig_path = std::path::Path::new(&original_path_str);
    if orig_path.exists() {
        let _ = std::fs::remove_file(orig_path);
    }
    let marked_path = std::path::Path::new(&marked_path_str);
    if marked_path.exists() {
        let _ = std::fs::remove_file(marked_path);
    }

    conn.execute("DELETE FROM doc_templates WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 3: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. Because the only `#[cfg]` gate involved (`target_os = "linux"`) lives entirely inside `open_path_impl`'s unchanged body, this refactor does not touch, move, or duplicate any `#[cfg]`-gated code — no Windows-target check is needed for this specific change.

- [ ] **Step 4: Test/verification**

No test in `apps/desktop/src-tauri/tests/` references `open_path`, `open_path_impl`, `try_open_via_wsl`, or `delete_template`. No `AppHandle`-mocking test harness exists in this codebase. Verification is `cargo check`/`cargo build`, plus a manual smoke test: from the running desktop app, open a document from a case's file list (exercises `open_path`) and delete a document template from Settings (exercises `delete_template`); confirm both behave identically to before this change. `open_path`'s WSL branch can only be exercised on a WSL dev machine — if testing happens on plain Linux or macOS, only the universal `app.opener()` fallback path is covered (the platform-independent behavior most users hit); note in the PR if the WSL-specific branch was not manually re-verified.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/doc_template/mod.rs
git commit -m "Run open_path and delete_template on the blocking pool"
```

---

### Task 2: Doc-template field-extraction follow-ups

**Files:**
- Modify: `apps/desktop/src-tauri/src/doc_template/context.rs:5-73` (`get_template_field_context`)
- Modify: `apps/desktop/src-tauri/src/doc_template/mod.rs:467-508` (`sync_template_fields`, `sync_all_templates_fields`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

All three functions are currently plain `pub fn` (not `async fn`) `#[tauri::command]`s. Each calls `extractor::extract()` — directly, or via the private helper `sync_single_template_internal` — the same CPU-bound PDF/DOCX parsing call already wrapped in `run_blocking` inside `indexer::index_file_core_impl` in the already-shipped plan. `sync_single_template_internal` itself does more than just extraction (it also diffs old/new field names against `case_templates` rows and writes back to `doc_templates`/`case_templates`), so rather than wrapping only the `extractor::extract()` call inline, this task follows the whole-function-body split pattern already established for `case::save_case_document_fields`: convert each command to a thin `pub async fn` wrapper that calls `crate::blocking::run_blocking(move || ...).await`, delegating to a new private `..._blocking` function containing the exact original body. `sync_single_template_internal` itself is unchanged — it's already a plain sync helper called from within the new `_blocking` functions, same as before.

**Note: Task 1 (above) already modified `doc_template/mod.rs` lines 697-800. Re-read the file's current line numbers before starting this task — Task 1's edits may have shifted `sync_template_fields`/`sync_all_templates_fields`'s exact line numbers slightly, though they're at 467-508, well before Task 1's 697+ edits, so no shift is expected in practice.**

- [ ] **Step 1: Split `get_template_field_context`**

Current code (`apps/desktop/src-tauri/src/doc_template/context.rs:1-73`, full file):

```rust
use tauri::AppHandle;
use std::path::Path;
use crate::{extractor, store};

#[tauri::command]
pub fn get_template_field_context(
    app: AppHandle,
    template_id: i64,
    field_name: String,
) -> Result<String, String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let marked_path_str: String = stmt
        .query_row(rusqlite::params![template_id], |row| row.get(0))
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;

    let marked_path = Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Marked template file not found at {marked_path_str}"));
    }

    let extracted = extractor::extract(marked_path)?;
    let text = extracted.text;

    let search_tag = format!("[[{}]]", field_name);
    let lines: Vec<&str> = text.lines().collect();

    for (i, &line) in lines.iter().enumerate() {
        if line.contains(&search_tag) {
            // Found the line containing our field!
            // Build a 5-line context window (2 above, matching line, 2 below)
            let start_line = if i >= 2 { i - 2 } else { 0 };
            let end_line = std::cmp::min(lines.len(), i + 3); // i + 2 inclusive is i + 3 exclusive

            let mut snippet_lines = Vec::new();
            for idx in start_line..end_line {
                let current_line = lines[idx];
                if idx == i {
                    // Match line: truncate it around the placeholder to 22 characters left/right
                    let char_vec: Vec<char> = current_line.chars().collect();
                    let tag_chars: Vec<char> = search_tag.chars().collect();

                    if let Some(pos) = char_vec.windows(tag_chars.len()).position(|w| w == tag_chars) {
                        let left_bound = if pos > 22 { pos - 22 } else { 0 };
                        let right_bound = std::cmp::min(char_vec.len(), pos + tag_chars.len() + 22);

                        let mut part: String = char_vec[left_bound..right_bound].iter().collect();
                        if left_bound > 0 {
                            part = format!("...{}", part);
                        }
                        if right_bound < char_vec.len() {
                            part = format!("{}...", part);
                        }
                        snippet_lines.push(part);
                    } else {
                        snippet_lines.push(current_line.to_string());
                    }
                } else {
                    // Context lines: display the whole line or a trimmed version
                    snippet_lines.push(current_line.trim().to_string());
                }
            }

            return Ok(snippet_lines.join("\n"));
        }
    }

    Err(format!("Field [[{}]] not found in the template text.", field_name))
}
```

Replace with:

```rust
use tauri::AppHandle;
use std::path::Path;
use crate::{extractor, store};

#[tauri::command]
pub async fn get_template_field_context(
    app: AppHandle,
    template_id: i64,
    field_name: String,
) -> Result<String, String> {
    // Entirely synchronous DB + CPU-bound extraction work -- run on the blocking
    // pool so it doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || {
        get_template_field_context_blocking(app, template_id, field_name)
    }).await
}

fn get_template_field_context_blocking(
    app: AppHandle,
    template_id: i64,
    field_name: String,
) -> Result<String, String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let marked_path_str: String = stmt
        .query_row(rusqlite::params![template_id], |row| row.get(0))
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;

    let marked_path = Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Marked template file not found at {marked_path_str}"));
    }

    let extracted = extractor::extract(marked_path)?;
    let text = extracted.text;

    let search_tag = format!("[[{}]]", field_name);
    let lines: Vec<&str> = text.lines().collect();

    for (i, &line) in lines.iter().enumerate() {
        if line.contains(&search_tag) {
            // Found the line containing our field!
            // Build a 5-line context window (2 above, matching line, 2 below)
            let start_line = if i >= 2 { i - 2 } else { 0 };
            let end_line = std::cmp::min(lines.len(), i + 3); // i + 2 inclusive is i + 3 exclusive

            let mut snippet_lines = Vec::new();
            for idx in start_line..end_line {
                let current_line = lines[idx];
                if idx == i {
                    // Match line: truncate it around the placeholder to 22 characters left/right
                    let char_vec: Vec<char> = current_line.chars().collect();
                    let tag_chars: Vec<char> = search_tag.chars().collect();

                    if let Some(pos) = char_vec.windows(tag_chars.len()).position(|w| w == tag_chars) {
                        let left_bound = if pos > 22 { pos - 22 } else { 0 };
                        let right_bound = std::cmp::min(char_vec.len(), pos + tag_chars.len() + 22);

                        let mut part: String = char_vec[left_bound..right_bound].iter().collect();
                        if left_bound > 0 {
                            part = format!("...{}", part);
                        }
                        if right_bound < char_vec.len() {
                            part = format!("{}...", part);
                        }
                        snippet_lines.push(part);
                    } else {
                        snippet_lines.push(current_line.to_string());
                    }
                } else {
                    // Context lines: display the whole line or a trimmed version
                    snippet_lines.push(current_line.trim().to_string());
                }
            }

            return Ok(snippet_lines.join("\n"));
        }
    }

    Err(format!("Field [[{}]] not found in the template text.", field_name))
}
```

- [ ] **Step 2: Split `sync_template_fields` and `sync_all_templates_fields`**

Current code (`apps/desktop/src-tauri/src/doc_template/mod.rs:467-508`):

```rust
#[tauri::command]
pub fn sync_template_fields(app: AppHandle, template_id: i64) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    
    let mut stmt = conn
        .prepare("SELECT marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    let marked_path_str: String = stmt
        .query_row(rusqlite::params![template_id], |row| row.get(0))
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;
        
    sync_single_template_internal(&conn, template_id, &marked_path_str)
}

#[tauri::command]
pub fn sync_all_templates_fields(app: AppHandle) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    
    let mut stmt = conn
        .prepare("SELECT id, file_name, marked_path FROM doc_templates")
        .map_err(|e| e.to_string())?;
        
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?;
    
    let mut errors = Vec::new();
    for r in rows {
        if let Ok((id, file_name, marked_path_str)) = r {
            if let Err(e) = sync_single_template_internal(&conn, id, &marked_path_str) {
                errors.push(format!("Failed to sync {file_name}: {e}"));
            }
        }
    }
    
    if !errors.is_empty() {
        return Err(errors.join("; "));
    }
    
    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn sync_template_fields(app: AppHandle, template_id: i64) -> Result<Vec<String>, String> {
    // Opens a DB connection and calls extractor::extract() via
    // sync_single_template_internal -- both synchronous, run on the blocking pool.
    crate::blocking::run_blocking(move || sync_template_fields_blocking(app, template_id)).await
}

fn sync_template_fields_blocking(app: AppHandle, template_id: i64) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT marked_path FROM doc_templates WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let marked_path_str: String = stmt
        .query_row(rusqlite::params![template_id], |row| row.get(0))
        .map_err(|e| format!("Failed to find template with ID {template_id}: {e}"))?;

    sync_single_template_internal(&conn, template_id, &marked_path_str)
}

#[tauri::command]
pub async fn sync_all_templates_fields(app: AppHandle) -> Result<(), String> {
    // Loops over every template, calling extractor::extract() once per
    // template via sync_single_template_internal -- run the whole loop on
    // the blocking pool so a firm with many templates doesn't stall the
    // async worker pool for the duration of the full sync.
    crate::blocking::run_blocking(move || sync_all_templates_fields_blocking(app)).await
}

fn sync_all_templates_fields_blocking(app: AppHandle) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    let mut stmt = conn
        .prepare("SELECT id, file_name, marked_path FROM doc_templates")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?;

    let mut errors = Vec::new();
    for r in rows {
        if let Ok((id, file_name, marked_path_str)) = r {
            if let Err(e) = sync_single_template_internal(&conn, id, &marked_path_str) {
                errors.push(format!("Failed to sync {file_name}: {e}"));
            }
        }
    }

    if !errors.is_empty() {
        return Err(errors.join("; "));
    }

    Ok(())
}
```

`sync_single_template_internal` (`doc_template/mod.rs:402-465`) is unchanged — it's already a plain sync helper taking `&rusqlite::Connection`, and is now called from within `sync_template_fields_blocking`/`sync_all_templates_fields_blocking` exactly as it was called from the original command bodies.

- [ ] **Step 3: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. In particular, confirm `AppHandle`, `i64`, and `String` (all owned/`Send`) satisfy `run_blocking`'s `F: FnOnce() -> Result<T, String> + Send + 'static, T: Send + 'static` bound for all three closures.

- [ ] **Step 4: Manual verification (no existing test coverage)**

No test in `apps/desktop/src-tauri/tests/` references `sync_template_fields`, `sync_all_templates_fields`, `get_template_field_context`, or `sync_single_template_internal`. Verification is `cargo check`/`cargo build` (pure code-motion) plus a manual smoke test via the running desktop app: open a document template's field-mapping UI, confirm the field-context snippet still renders correctly for an existing field, then trigger a template re-sync (single template and "sync all") and confirm the detected field list is unchanged from before this change.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/doc_template/context.rs apps/desktop/src-tauri/src/doc_template/mod.rs
git commit -m "Run doc-template field extraction on the blocking pool"
```

---

### Task 3: Case module file/field operations

**Files:**
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:405` (`list_case_files`)
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:584` (`add_file_to_case`)
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:666` (`save_case_fields`)
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:684` (`remove_file_from_case`)
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:802` (`read_file_bytes`)
- Modify: `apps/desktop/src-tauri/src/case/annotations.rs:36` (`set_case_annotations`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

**Note on `add_file_to_case`:** verified `index_case_file_in_background` (`apps/desktop/src-tauri/src/indexer/mod.rs:37-44`), called as this function's last step, is itself a plain, synchronous `pub fn` — it clones the `AppHandle` and calls `tauri::async_runtime::spawn(async move { ... })` *internally*, then returns immediately. Calling it requires no `.await`; it is safe to call from inside a `run_blocking` closure exactly like every other synchronous call in this function. So `add_file_to_case` gets the same full-function-split treatment as `save_case_document_fields`, not a partial split.

**Task 4 (below) modifies `case/mod.rs:63-107` — earlier in the file than every function in this task. Execute this task first (per Task Ordering above) so Task 4's line numbers aren't shifted by these edits.**

- [ ] **Step 1: Fix `case::list_case_files`**

Current code (`apps/desktop/src-tauri/src/case/mod.rs:404-498`):

```rust
#[tauri::command]
pub fn list_case_files(app: AppHandle, folder_path: String) -> Result<Vec<CaseFile>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let conn = store::open_db(&app)?;

    let entries = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                
                // Skip hidden files and Microsoft Word temporary files
                if name.starts_with('.') || name.starts_with("~$") {
                    continue;
                }

                let ext = p.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                
                let size_kb = std::fs::metadata(&p)
                    .map(|m| m.len() as i64 / 1024)
                    .unwrap_or(0);

                let path_str = p.to_string_lossy().to_string();
                let normalized_path = path_str.replace('\\', "/");
                
                // 1. Try to find the title in the indexed documents (supporting slash normalization and suffix matches)
                let mut title: Option<String> = conn.query_row(
                    "SELECT title FROM documents 
                     WHERE REPLACE(file_path, '\\', '/') = ?1 
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?1 AND length(file_path) > 10)
                        OR (?1 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?1) > 10)",
                    params![normalized_path],
                    |row| row.get(0)
                ).ok();

                // 2. Fall back to matching template name in doc_templates
                if title.is_none() || title.as_deref().unwrap_or("").trim().is_empty() {
                    let temp_title: Option<String> = conn.query_row(
                        "SELECT title FROM doc_templates WHERE file_name = ?1",
                        params![name],
                        |row| row.get(0)
                    ).ok();
                    if temp_title.is_some() && !temp_title.as_deref().unwrap_or("").trim().is_empty() {
                        title = temp_title;
                    }
                }

                // 3. Query notes from document_annotations
                let notes: Option<String> = conn.query_row(
                    "SELECT notes FROM document_annotations
                     WHERE file_path = ?1
                        OR REPLACE(file_path, '\\', '/') = ?2
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?2 AND length(file_path) > 10)
                        OR (?2 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?2) > 10)",
                    params![path_str, normalized_path],
                    |row| row.get(0)
                ).unwrap_or(None);

                let tags = list_tags_for_document_fuzzy(&conn, &path_str).unwrap_or_default();

                files.push(CaseFile {
                    name,
                    path: path_str,
                    ext,
                    size_kb,
                    title,
                    notes,
                    tags,
                });
            }
        }
    }
    
    // Sort files by name
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    Ok(files)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_case_files(app: AppHandle, folder_path: String) -> Result<Vec<CaseFile>, String> {
    // Directory scan + per-file DB lookups -- run on the blocking pool so a case
    // with many files doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || list_case_files_blocking(app, folder_path)).await
}

fn list_case_files_blocking(app: AppHandle, folder_path: String) -> Result<Vec<CaseFile>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() {
        return Err("Directory does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let conn = store::open_db(&app)?;

    let entries = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                
                // Skip hidden files and Microsoft Word temporary files
                if name.starts_with('.') || name.starts_with("~$") {
                    continue;
                }

                let ext = p.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                
                let size_kb = std::fs::metadata(&p)
                    .map(|m| m.len() as i64 / 1024)
                    .unwrap_or(0);

                let path_str = p.to_string_lossy().to_string();
                let normalized_path = path_str.replace('\\', "/");
                
                // 1. Try to find the title in the indexed documents (supporting slash normalization and suffix matches)
                let mut title: Option<String> = conn.query_row(
                    "SELECT title FROM documents 
                     WHERE REPLACE(file_path, '\\', '/') = ?1 
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?1 AND length(file_path) > 10)
                        OR (?1 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?1) > 10)",
                    params![normalized_path],
                    |row| row.get(0)
                ).ok();

                // 2. Fall back to matching template name in doc_templates
                if title.is_none() || title.as_deref().unwrap_or("").trim().is_empty() {
                    let temp_title: Option<String> = conn.query_row(
                        "SELECT title FROM doc_templates WHERE file_name = ?1",
                        params![name],
                        |row| row.get(0)
                    ).ok();
                    if temp_title.is_some() && !temp_title.as_deref().unwrap_or("").trim().is_empty() {
                        title = temp_title;
                    }
                }

                // 3. Query notes from document_annotations
                let notes: Option<String> = conn.query_row(
                    "SELECT notes FROM document_annotations
                     WHERE file_path = ?1
                        OR REPLACE(file_path, '\\', '/') = ?2
                        OR (REPLACE(file_path, '\\', '/') LIKE '%' || ?2 AND length(file_path) > 10)
                        OR (?2 LIKE '%' || REPLACE(file_path, '\\', '/') AND length(?2) > 10)",
                    params![path_str, normalized_path],
                    |row| row.get(0)
                ).unwrap_or(None);

                let tags = list_tags_for_document_fuzzy(&conn, &path_str).unwrap_or_default();

                files.push(CaseFile {
                    name,
                    path: path_str,
                    ext,
                    size_kb,
                    title,
                    notes,
                    tags,
                });
            }
        }
    }
    
    // Sort files by name
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    Ok(files)
}
```

- [ ] **Step 2: Fix `case::add_file_to_case`**

Current code (`apps/desktop/src-tauri/src/case/mod.rs:583-637`):

```rust
#[tauri::command]
pub fn add_file_to_case(
    app: AppHandle,
    case_folder: String,
    source_path: String,
) -> Result<String, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }
    if !src.is_file() {
        return Err("Source path is not a file".to_string());
    }

    let dest_dir = Path::new(&case_folder);
    if !dest_dir.exists() {
        return Err("Case directory does not exist".to_string());
    }

    let file_name = src.file_name()
        .ok_or_else(|| "Invalid source file name".to_string())?;
    
    let dest_path = dest_dir.join(file_name);
    
    let dest_exists = dest_path.exists();

    // Create backup version if file already exists (before overwriting)
    if dest_exists {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("State before update".to_string()), true, false) {
            println!("Failed to create document version backup on add: {}", e);
        }
    }

    // Copy the file to the case folder
    std::fs::copy(src, &dest_path)
        .map_err(|e| format!("Failed to copy file to case directory: {e}"))?;

    // Create version backup immediately if we overwrote an existing file
    if dest_exists {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Updated from attachment".to_string()), true, false) {
            println!("Failed to create document version backup on add: {}", e);
        }
    } else {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Original Version".to_string()), true, true) {
            println!("Failed to create document version backup on add (new file): {}", e);
        }
    }

    // Index it: this is what makes the document searchable and what links it to the case.
    // Without it the file shows in the folder listing and nowhere else — invisible to
    // search and to the email matcher's Tier B.
    crate::indexer::index_case_file_in_background(&app, dest_path.to_string_lossy().to_string());

    Ok(dest_path.to_string_lossy().to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn add_file_to_case(
    app: AppHandle,
    case_folder: String,
    source_path: String,
) -> Result<String, String> {
    // Filesystem copy + version-backup I/O -- run on the blocking pool. The trailing
    // index_case_file_in_background call is itself a synchronous fire-and-forget
    // spawn (see this task's note above) so it's safe to leave inside this closure too.
    crate::blocking::run_blocking(move || add_file_to_case_blocking(app, case_folder, source_path)).await
}

fn add_file_to_case_blocking(
    app: AppHandle,
    case_folder: String,
    source_path: String,
) -> Result<String, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }
    if !src.is_file() {
        return Err("Source path is not a file".to_string());
    }

    let dest_dir = Path::new(&case_folder);
    if !dest_dir.exists() {
        return Err("Case directory does not exist".to_string());
    }

    let file_name = src.file_name()
        .ok_or_else(|| "Invalid source file name".to_string())?;
    
    let dest_path = dest_dir.join(file_name);
    
    let dest_exists = dest_path.exists();

    // Create backup version if file already exists (before overwriting)
    if dest_exists {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("State before update".to_string()), true, false) {
            println!("Failed to create document version backup on add: {}", e);
        }
    }

    // Copy the file to the case folder
    std::fs::copy(src, &dest_path)
        .map_err(|e| format!("Failed to copy file to case directory: {e}"))?;

    // Create version backup immediately if we overwrote an existing file
    if dest_exists {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Updated from attachment".to_string()), true, false) {
            println!("Failed to create document version backup on add: {}", e);
        }
    } else {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Original Version".to_string()), true, true) {
            println!("Failed to create document version backup on add (new file): {}", e);
        }
    }

    // Index it: this is what makes the document searchable and what links it to the case.
    // Without it the file shows in the folder listing and nowhere else — invisible to
    // search and to the email matcher's Tier B.
    crate::indexer::index_case_file_in_background(&app, dest_path.to_string_lossy().to_string());

    Ok(dest_path.to_string_lossy().to_string())
}
```

- [ ] **Step 3: Fix `case::save_case_fields`**

Current code (`apps/desktop/src-tauri/src/case/mod.rs:665-681`):

```rust
#[tauri::command]
pub fn save_case_fields(
    app: AppHandle,
    case_id: i64,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    println!("save_case_fields for case_id {}: {:?}", case_id, fields);
    let conn = store::open_db(&app)?;
    for (key, val) in fields {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![case_id, key, val],
        ).map_err(|e| format!("[save_case_fields] {e}"))?;
    }
    refresh_case_matcher_indexes(&conn, case_id);
    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn save_case_fields(
    app: AppHandle,
    case_id: i64,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    crate::blocking::run_blocking(move || save_case_fields_blocking(app, case_id, fields)).await
}

fn save_case_fields_blocking(
    app: AppHandle,
    case_id: i64,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    println!("save_case_fields for case_id {}: {:?}", case_id, fields);
    let conn = store::open_db(&app)?;
    for (key, val) in fields {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![case_id, key, val],
        ).map_err(|e| format!("[save_case_fields] {e}"))?;
    }
    refresh_case_matcher_indexes(&conn, case_id);
    Ok(())
}
```

- [ ] **Step 4: Fix `case::remove_file_from_case`**

Current code (`apps/desktop/src-tauri/src/case/mod.rs:683-799`):

```rust
#[tauri::command]
pub fn remove_file_from_case(
    app: AppHandle,
    case_id: i64,
    file_name: String,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    // 1. Get folder path for the case
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to find case: {e}"))?;

    let file_path = Path::new(&folder_path).join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();
    let normalized_file_path = file_path_str.replace('\\', "/");

    // 2. Query fields defined in the template matching the file name being deleted
    let deleted_fields: Vec<String> = match conn.query_row(
        "SELECT fields_found FROM doc_templates WHERE file_name = ?1",
        params![file_name],
        |row| row.get::<_, String>(0)
    ) {
        Ok(fields_json) => {
            serde_json::from_str(&fields_json).unwrap_or_default()
        }
        Err(_) => Vec::new(),
    };

    // 3. Physically delete the file from disk if it exists
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file from disk: {e}"))?;
    }

    // Delete all version files from disk and records from DB
    if let Ok(mut stmt) = conn.prepare(
        "SELECT version_path FROM document_versions 
         WHERE active_path = ?1 OR REPLACE(active_path, '\\', '/') = ?2"
    ) {
        if let Ok(rows) = stmt.query_map(params![file_path_str, normalized_file_path], |row| row.get::<_, String>(0)) {
            for r in rows {
                if let Ok(vp) = r {
                    let path = std::path::Path::new(&vp);
                    if path.exists() {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
    }
    
    let _ = conn.execute(
        "DELETE FROM document_versions WHERE active_path = ?1 OR REPLACE(active_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    // 4. Delete document-specific DB entries (annotations and FTS/metadata index)
    let _ = conn.execute(
        "DELETE FROM document_annotations WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    let _ = conn.execute(
        "DELETE FROM documents WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    // 5. Clean up case fields that are no longer used by any other document in the case folder
    if !deleted_fields.is_empty() {
        let mut remaining_fields = std::collections::HashSet::new();
        if let Ok(entries) = std::fs::read_dir(&folder_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let p = entry.path();
                    if p.is_file() {
                        let name = p.file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("");
                        
                        // Skip hidden and Word temp files
                        if name.starts_with('.') || name.starts_with("~$") {
                            continue;
                        }

                        // Get fields found for this remaining template
                        if let Ok(fields_json) = conn.query_row(
                            "SELECT fields_found FROM doc_templates WHERE file_name = ?1",
                            params![name],
                            |row| row.get::<_, String>(0)
                        ) {
                            if let Ok(fields) = serde_json::from_str::<Vec<String>>(&fields_json) {
                                for field in fields {
                                    remaining_fields.insert(field);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Delete from case_fields where case_id = case_id AND field_name NOT IN remaining_fields
        for field in deleted_fields {
            if !remaining_fields.contains(&field) {
                let _ = conn.execute(
                    "DELETE FROM case_fields WHERE case_id = ?1 AND field_name = ?2",
                    params![case_id, field],
                );
            }
        }
    }

    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn remove_file_from_case(
    app: AppHandle,
    case_id: i64,
    file_name: String,
) -> Result<(), String> {
    // Multiple sequential SQL statements + filesystem deletes + a second folder scan --
    // run on the blocking pool so it doesn't stall every other in-flight command.
    crate::blocking::run_blocking(move || remove_file_from_case_blocking(app, case_id, file_name)).await
}

fn remove_file_from_case_blocking(
    app: AppHandle,
    case_id: i64,
    file_name: String,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;

    // 1. Get folder path for the case
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to find case: {e}"))?;

    let file_path = Path::new(&folder_path).join(&file_name);
    let file_path_str = file_path.to_string_lossy().to_string();
    let normalized_file_path = file_path_str.replace('\\', "/");

    // 2. Query fields defined in the template matching the file name being deleted
    let deleted_fields: Vec<String> = match conn.query_row(
        "SELECT fields_found FROM doc_templates WHERE file_name = ?1",
        params![file_name],
        |row| row.get::<_, String>(0)
    ) {
        Ok(fields_json) => {
            serde_json::from_str(&fields_json).unwrap_or_default()
        }
        Err(_) => Vec::new(),
    };

    // 3. Physically delete the file from disk if it exists
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file from disk: {e}"))?;
    }

    // Delete all version files from disk and records from DB
    if let Ok(mut stmt) = conn.prepare(
        "SELECT version_path FROM document_versions 
         WHERE active_path = ?1 OR REPLACE(active_path, '\\', '/') = ?2"
    ) {
        if let Ok(rows) = stmt.query_map(params![file_path_str, normalized_file_path], |row| row.get::<_, String>(0)) {
            for r in rows {
                if let Ok(vp) = r {
                    let path = std::path::Path::new(&vp);
                    if path.exists() {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
    }
    
    let _ = conn.execute(
        "DELETE FROM document_versions WHERE active_path = ?1 OR REPLACE(active_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    // 4. Delete document-specific DB entries (annotations and FTS/metadata index)
    let _ = conn.execute(
        "DELETE FROM document_annotations WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    let _ = conn.execute(
        "DELETE FROM documents WHERE file_path = ?1 OR REPLACE(file_path, '\\', '/') = ?2",
        params![file_path_str, normalized_file_path],
    );

    // 5. Clean up case fields that are no longer used by any other document in the case folder
    if !deleted_fields.is_empty() {
        let mut remaining_fields = std::collections::HashSet::new();
        if let Ok(entries) = std::fs::read_dir(&folder_path) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let p = entry.path();
                    if p.is_file() {
                        let name = p.file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("");
                        
                        // Skip hidden and Word temp files
                        if name.starts_with('.') || name.starts_with("~$") {
                            continue;
                        }

                        // Get fields found for this remaining template
                        if let Ok(fields_json) = conn.query_row(
                            "SELECT fields_found FROM doc_templates WHERE file_name = ?1",
                            params![name],
                            |row| row.get::<_, String>(0)
                        ) {
                            if let Ok(fields) = serde_json::from_str::<Vec<String>>(&fields_json) {
                                for field in fields {
                                    remaining_fields.insert(field);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Delete from case_fields where case_id = case_id AND field_name NOT IN remaining_fields
        for field in deleted_fields {
            if !remaining_fields.contains(&field) {
                let _ = conn.execute(
                    "DELETE FROM case_fields WHERE case_id = ?1 AND field_name = ?2",
                    params![case_id, field],
                );
            }
        }
    }

    Ok(())
}
```

- [ ] **Step 5: Fix `case::read_file_bytes`**

Current code (`apps/desktop/src-tauri/src/case/mod.rs:801-804`):

```rust
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read file from disk: {e}"))
}
```

Replace with (this one is a true one-liner with no `AppHandle` at all — inline the closure directly rather than adding a needless intermediate `_blocking` function):

```rust
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    // Reads whole documents (PDFs/DOCX can be multi-MB) -- run on the blocking pool.
    crate::blocking::run_blocking(move || {
        std::fs::read(&path).map_err(|e| format!("Failed to read file from disk: {e}"))
    }).await
}
```

- [ ] **Step 6: Fix `case::annotations::set_case_annotations`**

Current code (`apps/desktop/src-tauri/src/case/annotations.rs:35-57`):

```rust
#[tauri::command]
pub fn set_case_annotations(
    app: AppHandle,
    case_id: i64,
    notes: Option<String>,
) -> Result<CaseAnnotations, String> {
    let conn = store::open_db(&app)?;
    let updated_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO case_annotations (case_id, notes, updated_at)
         VALUES (?1, ?2, ?3)",
        params![case_id, notes, updated_at],
    ).map_err(|e| format!("[set_case_annotations] {e}"))?;

    super::refresh_case_matcher_indexes(&conn, case_id);

    Ok(CaseAnnotations {
        case_id,
        notes,
        updated_at,
    })
}
```

Replace with:

```rust
#[tauri::command]
pub async fn set_case_annotations(
    app: AppHandle,
    case_id: i64,
    notes: Option<String>,
) -> Result<CaseAnnotations, String> {
    crate::blocking::run_blocking(move || set_case_annotations_blocking(app, case_id, notes)).await
}

fn set_case_annotations_blocking(
    app: AppHandle,
    case_id: i64,
    notes: Option<String>,
) -> Result<CaseAnnotations, String> {
    let conn = store::open_db(&app)?;
    let updated_at = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO case_annotations (case_id, notes, updated_at)
         VALUES (?1, ?2, ?3)",
        params![case_id, notes, updated_at],
    ).map_err(|e| format!("[set_case_annotations] {e}"))?;

    super::refresh_case_matcher_indexes(&conn, case_id);

    Ok(CaseAnnotations {
        case_id,
        notes,
        updated_at,
    })
}
```

- [ ] **Step 7: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. In particular, confirm `CaseFile` (list_case_files' return type) and `CaseAnnotations` are `Send` — both are plain `Serialize`/`Deserialize` structs with owned `String`/`Option`/`Vec<Tag>` fields, so this holds without changes.

- [ ] **Step 8: Verification**

No existing test in `apps/desktop/src-tauri/tests/` references any of these six functions. No `AppHandle`-mocking test harness exists in this codebase. Verification is `cargo check`/`cargo build` plus a manual smoke test via the running desktop app:
- Open a case with several files in its folder; confirm the file list still loads with the same titles/notes/tags as before.
- Attach a new file to a case via "Add file"; confirm it appears in the folder, gets a version-backup entry, and becomes searchable shortly after (indexed in the background).
- Edit and save a case's custom fields; confirm they persist and the case-matcher index isn't broken.
- Remove a file from a case; confirm the file disappears from disk, its version history is gone, and any case fields unique to that file's template are cleaned up (while fields still used by remaining files stay).
- Open a document from a case (exercises `read_file_bytes`); confirm it still opens with correct content.
- Add/edit a case's sticky-note annotation; confirm it persists.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/src/case/mod.rs apps/desktop/src-tauri/src/case/annotations.rs
git commit -m "Run case file/field operations on the blocking pool"
```

---

### Task 4: Case list/search deduplication and blocking-pool offload

**Files:**
- Modify: `apps/desktop/src-tauri/src/case/lookup.rs:53-98` (add async wrapper after `load_active_cases`)
- Modify: `apps/desktop/src-tauri/src/case/lookup.rs:118-138` (`resolve_cases_for_paths`)
- Modify: `apps/desktop/src-tauri/src/case/lookup.rs:168-195` (`search_cases`)
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:63-107` (`list_cases`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`
- Produces: `pub(super) async fn load_active_cases_async(app: AppHandle) -> Result<Vec<Case>, String>` in `case/lookup.rs` — the single new shared entry point `list_cases`, `resolve_cases_for_paths`, and `search_cases` all call. The existing private sync `fn load_active_cases(app: &AppHandle) -> Result<Vec<Case>, String>` is unchanged internally and stays private to `lookup.rs`.

**Verified before drafting:** `case::list_cases` (case/mod.rs:64-107) and `case::lookup::load_active_cases` (lookup.rs:53-98) are genuinely near-duplicate — identical `SELECT ... FROM cases c LEFT JOIN case_annotations ca ...` query, identical row-mapping into `Case`, identical tag-bulk-attach loop via `list_all_tags_for_scope_type`. The only difference: `list_cases`'s SQL has `ORDER BY c.id DESC`; `load_active_cases` has none. Dedup is safe: `list_cases` sorts the result after fetching (id descending == the original `ORDER BY c.id DESC`, since `id` is `AUTOINCREMENT`), so `load_active_cases`'s query and its two existing callers (`resolve_cases_for_paths`, `search_cases`, both order-independent) are untouched.

Both `resolve_cases_for_paths` and `search_cases` are `#[tauri::command] pub fn` (not async) that call `load_active_cases(&app)?` directly and then do pure in-memory work (µs-scale — not worth wrapping in `run_blocking` on its own). Once the DB fetch moves behind an `.await`, both commands must become `pub async fn`.

**This task modifies `case/mod.rs:63-107` — earlier in the file than Task 3's edits (405-802). Task 3 must run first (per Task Ordering above) so this task's own line-63-107 citation isn't shifted by an earlier task landing after it — since Task 3's edits are all below line 107, they don't affect this task's line numbers regardless of order, but Task 3 running first keeps the overall sequence consistent with the stated ordering rule.**

- [ ] **Step 1: Add the shared async wrapper in `case/lookup.rs`**

Current code (`case/lookup.rs:53-98`, unchanged — shown for context, do not edit this function's body):

```rust
fn load_active_cases(app: &AppHandle) -> Result<Vec<Case>, String> {
    let conn = store::open_db(app)?;
    let mut stmt = conn
        .prepare(
            "
            SELECT c.id, c.subject, c.status, c.name, c.created_at, c.updated_at, c.folder, ca.notes
            FROM cases c
            LEFT JOIN case_annotations ca ON c.id = ca.case_id
            WHERE c.deleted = 0 OR c.deleted IS NULL
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Case {
                id: row.get(0)?,
                subject: row.get(1)?,
                status: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                folder: row.get(6)?,
                notes: row.get(7)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| e.to_string())?);
    }

    let all_case_tags = list_all_tags_for_scope_type(app, "case")?;
    for case in list.iter_mut() {
        let case_id_str = case.id.to_string();
        case.tags = all_case_tags
            .iter()
            .filter(|t| t.scope_value.as_deref() == Some(case_id_str.as_str()))
            .cloned()
            .collect();
    }

    Ok(list)
}
```

Insert immediately after it (new function, `load_active_cases` itself is untouched):

```rust
/// Runs `load_active_cases` on the blocking pool. Shared by every command
/// that needs the full active-case list -- `list_cases` (case/mod.rs),
/// `resolve_cases_for_paths`, and `search_cases` (below) -- so there is one
/// query to maintain, not three near-duplicates.
pub(super) async fn load_active_cases_async(app: AppHandle) -> Result<Vec<Case>, String> {
    crate::blocking::run_blocking(move || load_active_cases(&app)).await
}
```

- [ ] **Step 2: Fix `resolve_cases_for_paths`**

Current code (`case/lookup.rs:118-138`):

```rust
#[tauri::command]
pub fn resolve_cases_for_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<CasePathResolution>, String> {
    let cases = load_active_cases(&app)?;

    let mut out = Vec::with_capacity(paths.len());
    for path in paths {
        let case_link = parent_dir_normalized(&path)
            .and_then(|parent| resolve_case_for_parent(&parent, &cases))
            .map(|c| CaseLinkSummary {
                id: c.id,
                subject: c.subject.clone(),
            });

        out.push(CasePathResolution { path, case_link });
    }

    Ok(out)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn resolve_cases_for_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<CasePathResolution>, String> {
    let cases = load_active_cases_async(app).await?;

    let mut out = Vec::with_capacity(paths.len());
    for path in paths {
        let case_link = parent_dir_normalized(&path)
            .and_then(|parent| resolve_case_for_parent(&parent, &cases))
            .map(|c| CaseLinkSummary {
                id: c.id,
                subject: c.subject.clone(),
            });

        out.push(CasePathResolution { path, case_link });
    }

    Ok(out)
}
```

(`app` is consumed by value here and not referenced again afterward in the original body, so moving it into `load_active_cases_async(app)` needs no `.clone()`.)

- [ ] **Step 3: Fix `search_cases`**

Current code (`case/lookup.rs:168-195`):

```rust
#[tauri::command]
pub fn search_cases(
    app: AppHandle,
    tags: Option<Vec<TagFilter>>,
    notes_contains: Option<String>,
) -> Result<Vec<CaseSearchRow>, String> {
    let tags_ref = tags.as_deref();
    let notes_ref = notes_contains.as_deref();

    let mut matched: Vec<CaseSearchRow> = load_active_cases(&app)?
        .into_iter()
        .filter(|c| case_matches_filters(c, tags_ref, notes_ref))
        .map(|c| CaseSearchRow {
            id: c.id,
            subject: c.subject,
            status: c.status,
            folder: c.folder,
        })
        .collect();

    matched.sort_by(|a, b| {
        status_priority(&a.status)
            .cmp(&status_priority(&b.status))
            .then_with(|| b.id.cmp(&a.id))
    });

    Ok(matched)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn search_cases(
    app: AppHandle,
    tags: Option<Vec<TagFilter>>,
    notes_contains: Option<String>,
) -> Result<Vec<CaseSearchRow>, String> {
    let tags_ref = tags.as_deref();
    let notes_ref = notes_contains.as_deref();

    let mut matched: Vec<CaseSearchRow> = load_active_cases_async(app)
        .await?
        .into_iter()
        .filter(|c| case_matches_filters(c, tags_ref, notes_ref))
        .map(|c| CaseSearchRow {
            id: c.id,
            subject: c.subject,
            status: c.status,
            folder: c.folder,
        })
        .collect();

    matched.sort_by(|a, b| {
        status_priority(&a.status)
            .cmp(&status_priority(&b.status))
            .then_with(|| b.id.cmp(&a.id))
    });

    Ok(matched)
}
```

Note: `tags_ref`/`notes_ref` borrow from `tags`/`notes_contains`, not from `app` — computing them before the `.await` and using them after is fine.

- [ ] **Step 4: Fix `list_cases` in `case/mod.rs`, reusing the shared helper**

Current code (`case/mod.rs:63-107`):

```rust
#[tauri::command]
pub fn list_cases(app: AppHandle) -> Result<Vec<Case>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("
            SELECT c.id, c.subject, c.status, c.name, c.created_at, c.updated_at, c.folder, ca.notes
            FROM cases c
            LEFT JOIN case_annotations ca ON c.id = ca.case_id
            WHERE c.deleted = 0 OR c.deleted IS NULL
            ORDER BY c.id DESC
        ")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(Case {
            id: row.get(0)?,
            subject: row.get(1)?,
            status: row.get(2)?,
            name: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            folder: row.get(6)?,
            notes: row.get(7)?,
            tags: Vec::new(),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| e.to_string())?);
    }

    // Bulk-attach tags (one query for all cases instead of one per case).
    let all_case_tags = list_all_tags_for_scope_type(&app, "case")?;
    for case in list.iter_mut() {
        let case_id_str = case.id.to_string();
        case.tags = all_case_tags
            .iter()
            .filter(|t| t.scope_value.as_deref() == Some(case_id_str.as_str()))
            .cloned()
            .collect();
    }

    Ok(list)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_cases(app: AppHandle) -> Result<Vec<Case>, String> {
    // Delegates to the same query `resolve_cases_for_paths`/`search_cases` use
    // (case/lookup.rs) instead of maintaining a second near-identical one.
    // That shared query has no ORDER BY (its other callers don't need one);
    // sort here to preserve this command's original `ORDER BY c.id DESC`.
    let mut list = lookup::load_active_cases_async(app).await?;
    list.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(list)
}
```

`store::open_db` and `list_all_tags_for_scope_type` are no longer called directly from `list_cases` — check whether either import in `case/mod.rs` becomes unused as a result (it won't: both are used extensively elsewhere in this file, e.g. `store::open_db` in `add_case`/`delete_case`/etc. and `list_all_tags_for_scope_type` in other tag-attaching commands — confirm with a grep during implementation, don't assume).

- [ ] **Step 5: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. `lookup::load_active_cases_async` must be reachable from `case/mod.rs` (it will be — `pub(super) fn` in `lookup` is visible to its parent module `case`, and `case/mod.rs` already has `pub mod lookup;`).

- [ ] **Step 6: Manual smoke test**

No existing automated test touches any of these four commands, and all four take `AppHandle`. Verification is `cargo check`/`cargo build` plus a manual smoke test via the running desktop app: open Case Management (exercises `list_cases` — confirm the case list still appears in the same newest-first order as before), reference a file path that should resolve to an existing case's folder (exercises `resolve_cases_for_paths`), and use the case search/filter UI with a tag filter and a notes-contains filter (exercises `search_cases` — confirm results and their sort order by status-then-id are unchanged).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/case/lookup.rs apps/desktop/src-tauri/src/case/mod.rs
git commit -m "Deduplicate case-list query and run it on the blocking pool"
```

---

### Task 5: Unbounded global-scan commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/task/mod.rs:75-78` (`list_all_tasks`)
- Modify: `apps/desktop/src-tauri/src/tags/mod.rs:264-274` (`list_tag_values`)
- Modify: `apps/desktop/src-tauri/src/tags/mod.rs:276-300` (`list_all_tag_names`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

All three functions are simple query-and-return with zero `.await` in their bodies today — the same "async fn in name only" shape as `case::save_case_document_fields`.

**Task 6 (below) modifies `task/mod.rs:68-72` — earlier in the file than this task's `list_all_tasks` (74-78). Execute this task first (per Task Ordering above) so Task 6's line numbers aren't shifted.**

- [ ] **Step 1: Fix `task::list_all_tasks`**

Current code (`apps/desktop/src-tauri/src/task/mod.rs:74-78`):

```rust
#[tauri::command]
pub fn list_all_tasks(app: AppHandle) -> Result<Vec<store::TaskWithCaseRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_all_tasks(&conn).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_all_tasks(app: AppHandle) -> Result<Vec<store::TaskWithCaseRow>, String> {
    // Scans tasks across every case in the firm (unbounded, grows over time) --
    // run on the blocking pool so it doesn't stall every other in-flight command.
    crate::blocking::run_blocking(move || list_all_tasks_blocking(app)).await
}

fn list_all_tasks_blocking(app: AppHandle) -> Result<Vec<store::TaskWithCaseRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_all_tasks(&conn).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Fix `tags::list_tag_values`**

Current code (`apps/desktop/src-tauri/src/tags/mod.rs:264-274`):

```rust
/// Distinct existing values for a given tag name (e.g. every company name already
/// used), so a "pick existing or create new" UI can offer suggestions.
#[tauri::command]
pub fn list_tag_values(app: AppHandle, name: String) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT value FROM tags WHERE name = ?1 AND value IS NOT NULL ORDER BY value")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![name], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
```

Replace with:

```rust
/// Distinct existing values for a given tag name (e.g. every company name already
/// used), so a "pick existing or create new" UI can offer suggestions.
#[tauri::command]
pub async fn list_tag_values(app: AppHandle, name: String) -> Result<Vec<String>, String> {
    // Scans the entire `tags` table for this name across every case/document in
    // the database (unbounded) -- run on the blocking pool.
    crate::blocking::run_blocking(move || list_tag_values_blocking(app, name)).await
}

fn list_tag_values_blocking(app: AppHandle, name: String) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT DISTINCT value FROM tags WHERE name = ?1 AND value IS NOT NULL ORDER BY value")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![name], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Fix `tags::list_all_tag_names`**

Current code (`apps/desktop/src-tauri/src/tags/mod.rs:276-300`):

```rust
#[tauri::command]
pub fn list_all_tag_names(app: AppHandle, tag_type: Option<String>) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    let names = match tag_type {
        Some(t) => {
            let parsed = TagType::parse(&t)?;
            let mut stmt = conn
                .prepare("SELECT DISTINCT name FROM tags WHERE type = ?1 ORDER BY name")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![parsed.as_str()], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
        }
        None => {
            let mut stmt = conn
                .prepare("SELECT DISTINCT name FROM tags ORDER BY name")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
        }
    };
    names.map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_all_tag_names(app: AppHandle, tag_type: Option<String>) -> Result<Vec<String>, String> {
    // `SELECT DISTINCT name FROM tags` (optionally filtered by type) scans the
    // whole table, unscoped to any single case/document -- run on the blocking pool.
    crate::blocking::run_blocking(move || list_all_tag_names_blocking(app, tag_type)).await
}

fn list_all_tag_names_blocking(app: AppHandle, tag_type: Option<String>) -> Result<Vec<String>, String> {
    let conn = store::open_db(&app)?;
    let names = match tag_type {
        Some(t) => {
            let parsed = TagType::parse(&t)?;
            let mut stmt = conn
                .prepare("SELECT DISTINCT name FROM tags WHERE type = ?1 ORDER BY name")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![parsed.as_str()], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
        }
        None => {
            let mut stmt = conn
                .prepare("SELECT DISTINCT name FROM tags ORDER BY name")
                .map_err(|e| e.to_string())?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
        }
    };
    names.map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. `AppHandle`, `String`, `Option<String>` are all owned, `Send + 'static` — no borrowed captures in any of the three closures.

- [ ] **Step 5: Test/verification**

An existing test, `apps/desktop/src-tauri/tests/task_list_all_test.rs::list_all_tasks_joins_case_and_excludes_soft_deleted`, already covers this task's underlying logic — but it calls `store::list_all_tasks(&conn)` directly (the store-layer function), not the `#[tauri::command]` wrapper this task touches. That test is unaffected by this change and requires no re-run beyond the standard full-suite pass, since the wrapper's only change is thread placement, not logic.

No existing test exercises `tags::list_tag_values` or `tags::list_all_tag_names` at any layer. Verification for these two is `cargo check`/`cargo build` plus a manual smoke test: in the running app, add a few tags with distinct values to different cases, then confirm the tag-value/tag-name autocomplete/suggestion UI still returns the same distinct values as before this change.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/task/mod.rs apps/desktop/src-tauri/src/tags/mod.rs
git commit -m "Run list_all_tasks, list_tag_values, and list_all_tag_names on the blocking pool"
```

---

### Task 6: Bounded-loop mechanical batch (low urgency)

**Files:**
- Modify: `apps/desktop/src-tauri/src/case_template/mod.rs:4-31` (list_case_templates, create_case_template, update_case_template)
- Modify: `apps/desktop/src-tauri/src/task_template/mod.rs:4-29` (create_task_template, update_task_template)
- Modify: `apps/desktop/src-tauri/src/task/mod.rs:68-72` (reorder_tasks)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

All six functions here are one-line delegations to a `store::` helper that does the actual (small, bounded) N+1 loop or transaction. None have any `.await` today, so each is a straightforward "convert to `pub async fn`, wrap the body in `run_blocking`" change — no function splitting needed.

- [ ] **Step 1: Fix `case_template::list_case_templates`**

Current code (`apps/desktop/src-tauri/src/case_template/mod.rs:4-8`):

```rust
#[tauri::command]
pub fn list_case_templates(app: AppHandle) -> Result<Vec<store::CaseTemplateRow>, String> {
    let conn = store::open_db(&app)?;
    store::list_case_templates(&conn).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_case_templates(app: AppHandle) -> Result<Vec<store::CaseTemplateRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = store::open_db(&app)?;
        store::list_case_templates(&conn).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 2: Fix `case_template::create_case_template`**

Current code (`apps/desktop/src-tauri/src/case_template/mod.rs:10-19`):

```rust
#[tauri::command]
pub fn create_case_template(
    app: AppHandle,
    name: String,
    fields: Vec<String>,
    doc_template_ids: Vec<i64>,
) -> Result<i64, String> {
    let conn = store::open_db(&app)?;
    store::create_case_template(&conn, &name, &fields, &doc_template_ids).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn create_case_template(
    app: AppHandle,
    name: String,
    fields: Vec<String>,
    doc_template_ids: Vec<i64>,
) -> Result<i64, String> {
    crate::blocking::run_blocking(move || {
        let conn = store::open_db(&app)?;
        store::create_case_template(&conn, &name, &fields, &doc_template_ids).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 3: Fix `case_template::update_case_template`**

Current code (`apps/desktop/src-tauri/src/case_template/mod.rs:21-31`):

```rust
#[tauri::command]
pub fn update_case_template(
    app: AppHandle,
    id: i64,
    name: String,
    fields: Vec<String>,
    doc_template_ids: Vec<i64>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_case_template(&conn, id, &name, &fields, &doc_template_ids).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn update_case_template(
    app: AppHandle,
    id: i64,
    name: String,
    fields: Vec<String>,
    doc_template_ids: Vec<i64>,
) -> Result<(), String> {
    crate::blocking::run_blocking(move || {
        let conn = store::open_db(&app)?;
        store::update_case_template(&conn, id, &name, &fields, &doc_template_ids).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 4: Fix `task_template::create_task_template`**

Current code (`apps/desktop/src-tauri/src/task_template/mod.rs:10-18`):

```rust
#[tauri::command]
pub fn create_task_template(
    app: AppHandle,
    name: String,
    items: Vec<store::TaskTemplateItemInput>,
) -> Result<i64, String> {
    let conn = store::open_db(&app)?;
    store::create_task_template(&conn, &name, &items).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn create_task_template(
    app: AppHandle,
    name: String,
    items: Vec<store::TaskTemplateItemInput>,
) -> Result<i64, String> {
    crate::blocking::run_blocking(move || {
        let conn = store::open_db(&app)?;
        store::create_task_template(&conn, &name, &items).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 5: Fix `task_template::update_task_template`**

Current code (`apps/desktop/src-tauri/src/task_template/mod.rs:20-29`):

```rust
#[tauri::command]
pub fn update_task_template(
    app: AppHandle,
    id: i64,
    name: String,
    items: Vec<store::TaskTemplateItemInput>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::update_task_template(&conn, id, &name, &items).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn update_task_template(
    app: AppHandle,
    id: i64,
    name: String,
    items: Vec<store::TaskTemplateItemInput>,
) -> Result<(), String> {
    crate::blocking::run_blocking(move || {
        let conn = store::open_db(&app)?;
        store::update_task_template(&conn, id, &name, &items).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 6: Fix `task::reorder_tasks`**

Current code (`apps/desktop/src-tauri/src/task/mod.rs:68-72`):

```rust
#[tauri::command]
pub fn reorder_tasks(app: AppHandle, task_ids: Vec<i64>) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    store::reorder_tasks(&conn, &task_ids).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn reorder_tasks(app: AppHandle, task_ids: Vec<i64>) -> Result<(), String> {
    crate::blocking::run_blocking(move || {
        let conn = store::open_db(&app)?;
        store::reorder_tasks(&conn, &task_ids).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 7: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. Confirm each closure's captured types (`AppHandle`, `String`, `Vec<String>`, `Vec<i64>`, `i64`, `Vec<store::TaskTemplateItemInput>`) are all owned, non-borrowed, satisfying `run_blocking`'s `Send + 'static` bound.

- [ ] **Step 8: Test/verification**

None of these six command-level functions has existing test coverage. The only adjacent coverage is at the `store::` layer, untouched by this change (e.g. `store::list_all_tasks` is tested directly in `tests/task_list_all_test.rs`, but that's a different function from `task::reorder_tasks`). This task's verification bar is `cargo check`/`cargo build` passing, plus this reasoning: each change is a pure mechanical wrap of an already-tiny, already-correct one-line body — no logic inside the closure is altered, only its execution context. A manual smoke test (case-template create/edit, task-template create/edit, and drag-to-reorder on a case's task list through the running app) is recommended before merging this task but is not required to complete it, matching the shipped plan's Task 2 ruling.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/src/case_template/mod.rs apps/desktop/src-tauri/src/task_template/mod.rs apps/desktop/src-tauri/src/task/mod.rs
git commit -m "Run case/task template CRUD and task reorder on the blocking pool"
```

---

### Task 7: Calendar meeting-list N+1 fixes

**Files:**
- Modify: `apps/desktop/src-tauri/src/calendar/mod.rs:208-212` (`list_meetings_for_range`)
- Modify: `apps/desktop/src-tauri/src/calendar/mod.rs:214-218` (`list_meetings_for_case`)
- Modify: `apps/desktop/src-tauri/src/calendar/mod.rs:220-224` (`list_todays_meetings`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

**Note on scope:** all three command functions are separate `#[tauri::command]` entry points, so each needs its own fix. At the *store* layer, `store::list_todays_meetings` delegates to `store::list_meetings_for_range`, and both that function and `store::list_meetings_for_case` call the same private `with_attendees` once per returned row — that's the N+1. This task does **not** touch the store layer or eliminate the N+1 query pattern itself (per the audit's own recommendation and this plan's Global Constraints) — it only moves each command's existing blocking call off the async/IPC thread. Each command body is only 2 lines, so each becomes a thin `run_blocking`-wrapped closure inline — no separate private `_blocking` helper function is needed, matching the inline-closure style already used for `query::query_search_documents_core` in the shipped plan.

- [ ] **Step 1: Fix `list_meetings_for_range`**

Current code (`calendar/mod.rs:208-212`):

```rust
#[tauri::command]
pub fn list_meetings_for_range(app: AppHandle, start: String, end: String) -> Result<Vec<crate::store::MeetingRow>, String> {
    let conn = crate::store::open_db(&app)?;
    crate::store::list_meetings_for_range(&conn, &start, &end).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_meetings_for_range(app: AppHandle, start: String, end: String) -> Result<Vec<crate::store::MeetingRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = crate::store::open_db(&app)?;
        crate::store::list_meetings_for_range(&conn, &start, &end).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 2: Fix `list_meetings_for_case`**

Current code (`calendar/mod.rs:214-218`):

```rust
#[tauri::command]
pub fn list_meetings_for_case(app: AppHandle, case_id: i64) -> Result<Vec<crate::store::MeetingRow>, String> {
    let conn = crate::store::open_db(&app)?;
    crate::store::list_meetings_for_case(&conn, case_id).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_meetings_for_case(app: AppHandle, case_id: i64) -> Result<Vec<crate::store::MeetingRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = crate::store::open_db(&app)?;
        crate::store::list_meetings_for_case(&conn, case_id).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 3: Fix `list_todays_meetings`**

Current code (`calendar/mod.rs:220-224`):

```rust
#[tauri::command]
pub fn list_todays_meetings(app: AppHandle) -> Result<Vec<crate::store::MeetingRow>, String> {
    let conn = crate::store::open_db(&app)?;
    crate::store::list_todays_meetings(&conn).map_err(|e| e.to_string())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_todays_meetings(app: AppHandle) -> Result<Vec<crate::store::MeetingRow>, String> {
    crate::blocking::run_blocking(move || {
        let conn = crate::store::open_db(&app)?;
        crate::store::list_todays_meetings(&conn).map_err(|e| e.to_string())
    }).await
}
```

- [ ] **Step 4: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. `app: AppHandle`, `start: String`, `end: String`, and `case_id: i64` are all owned, non-borrowed values moved into each closure. `Vec<crate::store::MeetingRow>` must be `Send` (a plain data struct — confirm by reading `MeetingRow`'s definition if any doubt remains).

- [ ] **Step 5: Verification**

No existing test covers these three command functions at the `AppHandle` level — `apps/desktop/src-tauri/tests/meeting_attendees_test.rs` tests `store::replace_meeting_attendees` and related store-layer functions directly against a raw `rusqlite::Connection`, not through any of these three commands. Verification is `cargo check`/`cargo build` succeeding, plus a manual smoke test — open the Calendar view (day/week/month) and a case's meeting list, confirm meetings and their attendees still display correctly, exactly as before this change.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/calendar/mod.rs
git commit -m "Run calendar meeting-list queries on the blocking pool"
```

---

### Task 8: Document versioning blocking-pool offload

**Files:**
- Modify: `apps/desktop/src-tauri/src/documents/versioning.rs:375-418` (`list_document_versions`)
- Modify: `apps/desktop/src-tauri/src/documents/versioning.rs:420-454` (`restore_document_version`)
- Modify: `apps/desktop/src-tauri/src/documents/versioning.rs:456-479` (`delete_document_version`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

**Note:** this file also defines `start_case_watcher`/`stop_case_watcher`, which coordinate through a module-level `static ACTIVE_WATCHER_TX: OnceLock<Mutex<Option<oneshot::Sender<()>>>>`. None of the three functions below touch that lock or that state. No special care needed there; leave `start_case_watcher`/`stop_case_watcher` untouched.

- [ ] **Step 1: Fix `list_document_versions`**

Current code (`apps/desktop/src-tauri/src/documents/versioning.rs:374-418`):

```rust
#[tauri::command]
pub fn list_document_versions(
    app: AppHandle,
    file_path: String,
) -> Result<Vec<DocumentVersion>, String> {
    let conn = crate::store::open_db(&app)?;
    let normalized = file_path.replace('\\', "/").to_lowercase();
    let mut stmt = conn.prepare(
        "SELECT id, case_id, active_path, version_path, version_name, size_kb, created_at, notes, md5_hash
         FROM document_versions
         WHERE LOWER(active_path) = ?1 OR LOWER(REPLACE(active_path, '\\', '/')) = ?1
         ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![normalized], |row| {
        Ok(DocumentVersion {
            id: row.get(0)?,
            case_id: row.get(1)?,
            active_path: row.get(2)?,
            version_path: row.get(3)?,
            version_name: row.get(4)?,
            size_kb: row.get(5)?,
            created_at: row.get(6)?,
            notes: row.get(7)?,
            md5_hash: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let active_path = Path::new(&file_path);
    let active_md5 = if active_path.exists() {
        calculate_md5(active_path).ok()
    } else {
        None
    };

    let mut versions = Vec::new();
    for r in rows {
        if let Ok(v) = r {
            if Some(&v.md5_hash) != active_md5.as_ref() {
                versions.push(v);
            }
        }
    }
    Ok(versions)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_document_versions(
    app: AppHandle,
    file_path: String,
) -> Result<Vec<DocumentVersion>, String> {
    // Opens a DB connection, scans document_versions for this file, and MD5-hashes
    // the current on-disk file -- all synchronous. Run on the blocking pool so it
    // doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || list_document_versions_blocking(app, file_path)).await
}

fn list_document_versions_blocking(
    app: AppHandle,
    file_path: String,
) -> Result<Vec<DocumentVersion>, String> {
    let conn = crate::store::open_db(&app)?;
    let normalized = file_path.replace('\\', "/").to_lowercase();
    let mut stmt = conn.prepare(
        "SELECT id, case_id, active_path, version_path, version_name, size_kb, created_at, notes, md5_hash
         FROM document_versions
         WHERE LOWER(active_path) = ?1 OR LOWER(REPLACE(active_path, '\\', '/')) = ?1
         ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![normalized], |row| {
        Ok(DocumentVersion {
            id: row.get(0)?,
            case_id: row.get(1)?,
            active_path: row.get(2)?,
            version_path: row.get(3)?,
            version_name: row.get(4)?,
            size_kb: row.get(5)?,
            created_at: row.get(6)?,
            notes: row.get(7)?,
            md5_hash: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let active_path = Path::new(&file_path);
    let active_md5 = if active_path.exists() {
        calculate_md5(active_path).ok()
    } else {
        None
    };

    let mut versions = Vec::new();
    for r in rows {
        if let Ok(v) = r {
            if Some(&v.md5_hash) != active_md5.as_ref() {
                versions.push(v);
            }
        }
    }
    Ok(versions)
}
```

- [ ] **Step 2: Fix `restore_document_version`**

Current code (`apps/desktop/src-tauri/src/documents/versioning.rs:420-454`):

```rust
#[tauri::command]
pub fn restore_document_version(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let (active_path_str, version_path_str): (String, String) = conn.query_row(
        "SELECT active_path, version_path FROM document_versions WHERE id = ?1",
        params![version_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| format!("Failed to find version in DB: {e}"))?;

    let active_path = Path::new(&active_path_str);
    let version_path = Path::new(&version_path_str);

    if !version_path.exists() {
        return Err("Version backup file does not exist on disk".to_string());
    }

    // 1. Force back up current state first (so users can revert the restore if they want!)
    if active_path.exists() {
        if let Err(e) = create_document_backup_if_exists(&app, active_path, Some("State before restoring older version".to_string()), true, true) {
            println!("Pre-restore backup failed: {}", e);
        }
    }

    // 2. Restore file contents
    fs::copy(version_path, active_path)
        .map_err(|e| format!("Failed to restore version file contents: {e}"))?;

    // 3. Emit change notification to frontend
    let _ = app.emit("case-files-changed", ());

    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn restore_document_version(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    // DB lookup + backup (itself DB + MD5 hashing) + file copy -- all synchronous.
    // Run on the blocking pool so it doesn't stall every other in-flight command
    // while it runs.
    crate::blocking::run_blocking(move || restore_document_version_blocking(app, version_id)).await
}

fn restore_document_version_blocking(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let (active_path_str, version_path_str): (String, String) = conn.query_row(
        "SELECT active_path, version_path FROM document_versions WHERE id = ?1",
        params![version_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| format!("Failed to find version in DB: {e}"))?;

    let active_path = Path::new(&active_path_str);
    let version_path = Path::new(&version_path_str);

    if !version_path.exists() {
        return Err("Version backup file does not exist on disk".to_string());
    }

    // 1. Force back up current state first (so users can revert the restore if they want!)
    if active_path.exists() {
        if let Err(e) = create_document_backup_if_exists(&app, active_path, Some("State before restoring older version".to_string()), true, true) {
            println!("Pre-restore backup failed: {}", e);
        }
    }

    // 2. Restore file contents
    fs::copy(version_path, active_path)
        .map_err(|e| format!("Failed to restore version file contents: {e}"))?;

    // 3. Emit change notification to frontend
    let _ = app.emit("case-files-changed", ());

    Ok(())
}
```

**Verify against the file before editing:** `create_document_backup_if_exists` (called above) is a plain `pub fn` (versioning.rs:70) with no `.await` inside it — confirmed safe to call from within a `run_blocking` closure.

- [ ] **Step 3: Fix `delete_document_version`**

Current code (`apps/desktop/src-tauri/src/documents/versioning.rs:456-479`):

```rust
#[tauri::command]
pub fn delete_document_version(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let version_path_str: String = conn.query_row(
        "SELECT version_path FROM document_versions WHERE id = ?1",
        params![version_id],
        |row| row.get(0)
    ).map_err(|e| format!("Version record not found: {e}"))?;

    let path = Path::new(&version_path_str);
    if path.exists() {
        let _ = fs::remove_file(path);
    }

    conn.execute(
        "DELETE FROM document_versions WHERE id = ?1",
        params![version_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn delete_document_version(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    // DB lookup + filesystem delete + DB delete -- all synchronous. Run on the
    // blocking pool so it doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || delete_document_version_blocking(app, version_id)).await
}

fn delete_document_version_blocking(
    app: AppHandle,
    version_id: i64,
) -> Result<(), String> {
    let conn = crate::store::open_db(&app)?;
    let version_path_str: String = conn.query_row(
        "SELECT version_path FROM document_versions WHERE id = ?1",
        params![version_id],
        |row| row.get(0)
    ).map_err(|e| format!("Version record not found: {e}"))?;

    let path = Path::new(&version_path_str);
    if path.exists() {
        let _ = fs::remove_file(path);
    }

    conn.execute(
        "DELETE FROM document_versions WHERE id = ?1",
        params![version_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 4: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. Confirm `AppHandle`, `i64`, `String` satisfy `run_blocking`'s `Send + 'static` bound (they do), and that `Vec<DocumentVersion>` (a `Serialize + Deserialize + Debug + Clone` struct of owned fields) is `Send`.

- [ ] **Step 5: Test/verification**

No existing test in `apps/desktop/src-tauri/tests/` references `list_document_versions`, `restore_document_version`, or `delete_document_version`. Verification is `cargo check`/`cargo build` passing, plus a manual smoke test: open a case document with at least one saved version, list its versions, restore an older version (confirm the file contents update and a new "before restoring" backup is created), and delete a version (confirm its backup file is removed from disk and its DB row is gone).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/documents/versioning.rs
git commit -m "Run document-versioning commands on the blocking pool"
```

---

### Task 9: Email alert and attachment blocking-pool offload

**Files:**
- Modify: `apps/desktop/src-tauri/src/email/emails_alerts.rs:158-258` (`list_pending_email_alerts`), `:421-454` (`delete_email_alert`)
- Modify: `apps/desktop/src-tauri/src/email/emails_ops.rs:9-37` (`list_case_emails`), `:233-257` (`list_case_attachments`), `:259-323` (`remove_attachment`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking`

- [ ] **Step 1: Fix `list_pending_email_alerts`**

Current code (`apps/desktop/src-tauri/src/email/emails_alerts.rs:158-258`):

```rust
#[tauri::command]
pub fn list_pending_email_alerts(app: AppHandle) -> Result<Vec<PendingAlert>, String> {
    println!("[Rust Backend] list_pending_email_alerts called!");
    let conn = store::open_db(&app)?;

    // Clean up unrelated/spam pending alerts: never scored against any case at all.
    //
    // Both conditions, not either. `refresh_alert_suggestions` clears a suggestion that no
    // longer holds while keeping the best candidate's score, so an alert that *was* scored
    // and simply lost its match survives here and renders as "could not find a matching
    // case". Deleting on a null suggestion alone would silently discard the user's queued
    // email — and permanently, since these message ids also go into `ignored_emails`.
    let mut cleanup_stmt = conn
        .prepare("SELECT message_id FROM pending_email_alerts WHERE suggested_case_id IS NULL AND confidence = 0.0")
        .map_err(|e| e.to_string())?;

    let message_ids: Vec<String> = cleanup_stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let staging_base = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging");

    for msg_id in message_ids {
        let folder = staging_base.join(&msg_id);
        if folder.exists() {
            let _ = std::fs::remove_dir_all(folder);
        }
        // Save to ignored_emails to prevent infinite re-ingestion loop
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![msg_id],
        );
        let msg_id_trimmed = msg_id.trim_matches(|c| c == '<' || c == '>');
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![msg_id_trimmed],
        );
    }

    let _ = conn.execute("DELETE FROM pending_email_alerts WHERE suggested_case_id IS NULL AND confidence = 0.0", []);

    // After the cleanup, so a re-scored alert is never a candidate for deletion.
    match refresh_alert_suggestions(&conn) {
        Ok(n) if n > 0 => println!("[Rust Backend] refreshed {n} alert suggestion(s)"),
        Err(e) => eprintln!("[Rust Backend] could not refresh alert suggestions: {e}"),
        _ => {}
    }

    let mut stmt = conn
        .prepare("SELECT id, message_id, sender, subject, body_snippet, body_text, received_at, suggested_case_id, confidence, reason, attachments_json FROM pending_email_alerts ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |r| {
        Ok(PendingAlert {
            id: r.get(0)?,
            message_id: r.get(1)?,
            sender: r.get(2)?,
            subject: r.get(3)?,
            body_snippet: r.get(4)?,
            body_text: r.get(5)?,
            received_at: r.get(6)?,
            suggested_case_id: r.get(7)?,
            confidence: r.get(8)?,
            reason: r.get(9).unwrap_or_default(),
            attachments_json: r.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let alert = row.map_err(|e| e.to_string())?;
        let is_spam = is_transactional_or_spam(&alert.sender, &alert.subject);

        if is_spam {
            let folder = staging_base.join(&alert.message_id);
            if folder.exists() {
                let _ = std::fs::remove_dir_all(folder);
            }
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![alert.message_id],
            );
            let msg_id_trimmed = alert.message_id.trim_matches(|c| c == '<' || c == '>');
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![msg_id_trimmed],
            );
            let _ = conn.execute(
                "DELETE FROM pending_email_alerts WHERE id = ?1",
                params![alert.id],
            );
        } else {
            list.push(alert);
        }
    }
    println!("[Rust Backend] list_pending_email_alerts returning {} alerts", list.len());
    Ok(list)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_pending_email_alerts(app: AppHandle) -> Result<Vec<PendingAlert>, String> {
    // Entirely synchronous SQLite + filesystem work (a cleanup pass over staged
    // attachment folders, a suggestion-refresh pass, then the listing query) --
    // run on the blocking pool so it doesn't stall every other in-flight command
    // while it runs. This command is polled by the notification bell, so it runs
    // far more often than a typical one-shot command.
    crate::blocking::run_blocking(move || list_pending_email_alerts_blocking(app)).await
}

fn list_pending_email_alerts_blocking(app: AppHandle) -> Result<Vec<PendingAlert>, String> {
    println!("[Rust Backend] list_pending_email_alerts called!");
    let conn = store::open_db(&app)?;

    // Clean up unrelated/spam pending alerts: never scored against any case at all.
    //
    // Both conditions, not either. `refresh_alert_suggestions` clears a suggestion that no
    // longer holds while keeping the best candidate's score, so an alert that *was* scored
    // and simply lost its match survives here and renders as "could not find a matching
    // case". Deleting on a null suggestion alone would silently discard the user's queued
    // email — and permanently, since these message ids also go into `ignored_emails`.
    let mut cleanup_stmt = conn
        .prepare("SELECT message_id FROM pending_email_alerts WHERE suggested_case_id IS NULL AND confidence = 0.0")
        .map_err(|e| e.to_string())?;

    let message_ids: Vec<String> = cleanup_stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let staging_base = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging");

    for msg_id in message_ids {
        let folder = staging_base.join(&msg_id);
        if folder.exists() {
            let _ = std::fs::remove_dir_all(folder);
        }
        // Save to ignored_emails to prevent infinite re-ingestion loop
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![msg_id],
        );
        let msg_id_trimmed = msg_id.trim_matches(|c| c == '<' || c == '>');
        let _ = conn.execute(
            "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
            params![msg_id_trimmed],
        );
    }

    let _ = conn.execute("DELETE FROM pending_email_alerts WHERE suggested_case_id IS NULL AND confidence = 0.0", []);

    // After the cleanup, so a re-scored alert is never a candidate for deletion.
    match refresh_alert_suggestions(&conn) {
        Ok(n) if n > 0 => println!("[Rust Backend] refreshed {n} alert suggestion(s)"),
        Err(e) => eprintln!("[Rust Backend] could not refresh alert suggestions: {e}"),
        _ => {}
    }

    let mut stmt = conn
        .prepare("SELECT id, message_id, sender, subject, body_snippet, body_text, received_at, suggested_case_id, confidence, reason, attachments_json FROM pending_email_alerts ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |r| {
        Ok(PendingAlert {
            id: r.get(0)?,
            message_id: r.get(1)?,
            sender: r.get(2)?,
            subject: r.get(3)?,
            body_snippet: r.get(4)?,
            body_text: r.get(5)?,
            received_at: r.get(6)?,
            suggested_case_id: r.get(7)?,
            confidence: r.get(8)?,
            reason: r.get(9).unwrap_or_default(),
            attachments_json: r.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        let alert = row.map_err(|e| e.to_string())?;
        let is_spam = is_transactional_or_spam(&alert.sender, &alert.subject);

        if is_spam {
            let folder = staging_base.join(&alert.message_id);
            if folder.exists() {
                let _ = std::fs::remove_dir_all(folder);
            }
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![alert.message_id],
            );
            let msg_id_trimmed = alert.message_id.trim_matches(|c| c == '<' || c == '>');
            let _ = conn.execute(
                "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
                params![msg_id_trimmed],
            );
            let _ = conn.execute(
                "DELETE FROM pending_email_alerts WHERE id = ?1",
                params![alert.id],
            );
        } else {
            list.push(alert);
        }
    }
    println!("[Rust Backend] list_pending_email_alerts returning {} alerts", list.len());
    Ok(list)
}
```

- [ ] **Step 2: Fix `delete_email_alert`**

Current code (`apps/desktop/src-tauri/src/email/emails_alerts.rs:421-454`):

```rust
#[tauri::command]
pub fn delete_email_alert(app: AppHandle, alert_id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    
    // Get message_id for folder cleanup
    let message_id: String = conn.query_row(
        "SELECT message_id FROM pending_email_alerts WHERE id = ?1",
        params![alert_id],
        |r| r.get(0)
    ).map_err(|e| e.to_string())?;

    // Save to ignored_emails to prevent infinite re-ingestion loop
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id],
    );
    let message_id_trimmed = message_id.trim_matches(|c| c == '<' || c == '>');
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id_trimmed],
    );

    conn.execute("DELETE FROM pending_email_alerts WHERE id = ?1", params![alert_id]).map_err(|e| e.to_string())?;

    // Clean up staged folder
    let staging_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging")
        .join(message_id);
    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(staging_dir);
    }

    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn delete_email_alert(app: AppHandle, alert_id: i64) -> Result<(), String> {
    // Entirely synchronous SQLite + filesystem work -- run on the blocking pool so it
    // doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || delete_email_alert_blocking(app, alert_id)).await
}

fn delete_email_alert_blocking(app: AppHandle, alert_id: i64) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    
    // Get message_id for folder cleanup
    let message_id: String = conn.query_row(
        "SELECT message_id FROM pending_email_alerts WHERE id = ?1",
        params![alert_id],
        |r| r.get(0)
    ).map_err(|e| e.to_string())?;

    // Save to ignored_emails to prevent infinite re-ingestion loop
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id],
    );
    let message_id_trimmed = message_id.trim_matches(|c| c == '<' || c == '>');
    let _ = conn.execute(
        "INSERT OR IGNORE INTO ignored_emails (message_id) VALUES (?1)",
        params![message_id_trimmed],
    );

    conn.execute("DELETE FROM pending_email_alerts WHERE id = ?1", params![alert_id]).map_err(|e| e.to_string())?;

    // Clean up staged folder
    let staging_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("email_staging")
        .join(message_id);
    if staging_dir.exists() {
        let _ = std::fs::remove_dir_all(staging_dir);
    }

    Ok(())
}
```

- [ ] **Step 3: Fix `list_case_emails`**

Current code (`apps/desktop/src-tauri/src/email/emails_ops.rs:9-37`):

```rust
#[tauri::command]
pub fn list_case_emails(app: AppHandle, case_id: i64) -> Result<Vec<CaseEmail>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, case_id, message_id, sender, recipient, subject, body_text, body_html, direction, received_at, attachments_json FROM case_emails WHERE case_id = ?1 ORDER BY received_at ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |r| {
        Ok(CaseEmail {
            id: r.get(0)?,
            case_id: r.get(1)?,
            message_id: r.get(2)?,
            sender: r.get(3)?,
            recipient: r.get(4)?,
            subject: r.get(5)?,
            body_text: r.get(6)?,
            body_html: r.get(7)?,
            direction: r.get(8)?,
            received_at: r.get(9)?,
            attachments_json: r.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| e.to_string())?);
    }
    Ok(list)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_case_emails(app: AppHandle, case_id: i64) -> Result<Vec<CaseEmail>, String> {
    // A case's full email history (body_text/body_html included) is unbounded and grows
    // over the case's lifetime -- run on the blocking pool so it doesn't stall every other
    // in-flight command while it runs.
    crate::blocking::run_blocking(move || list_case_emails_blocking(app, case_id)).await
}

fn list_case_emails_blocking(app: AppHandle, case_id: i64) -> Result<Vec<CaseEmail>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT id, case_id, message_id, sender, recipient, subject, body_text, body_html, direction, received_at, attachments_json FROM case_emails WHERE case_id = ?1 ORDER BY received_at ASC")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |r| {
        Ok(CaseEmail {
            id: r.get(0)?,
            case_id: r.get(1)?,
            message_id: r.get(2)?,
            sender: r.get(3)?,
            recipient: r.get(4)?,
            subject: r.get(5)?,
            body_text: r.get(6)?,
            body_html: r.get(7)?,
            direction: r.get(8)?,
            received_at: r.get(9)?,
            attachments_json: r.get::<_, Option<String>>(10)?.unwrap_or_else(|| "[]".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row.map_err(|e| e.to_string())?);
    }
    Ok(list)
}
```

- [ ] **Step 4: Fix `list_case_attachments`**

Current code (`apps/desktop/src-tauri/src/email/emails_ops.rs:233-257`):

```rust
#[tauri::command]
pub fn list_case_attachments(app: AppHandle, case_id: i64) -> Result<Vec<super::types::AttachmentMetadata>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT attachments_json FROM case_emails WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |r| {
        let json_str: String = r.get(0)?;
        Ok(json_str)
    }).map_err(|e| e.to_string())?;

    let mut all_attachments = Vec::new();
    for row in rows {
        if let Ok(json_str) = row {
            let atts: Vec<super::types::AttachmentMetadata> = serde_json::from_str(&json_str).unwrap_or_default();
            for att in atts {
                if !att.is_imported.unwrap_or(false) {
                    all_attachments.push(att);
                }
            }
        }
    }
    Ok(all_attachments)
}
```

Replace with:

```rust
#[tauri::command]
pub async fn list_case_attachments(app: AppHandle, case_id: i64) -> Result<Vec<super::types::AttachmentMetadata>, String> {
    // Same unbounded per-case email scan as list_case_emails above, plus a JSON parse per
    // row -- run on the blocking pool so it doesn't stall every other in-flight command.
    crate::blocking::run_blocking(move || list_case_attachments_blocking(app, case_id)).await
}

fn list_case_attachments_blocking(app: AppHandle, case_id: i64) -> Result<Vec<super::types::AttachmentMetadata>, String> {
    let conn = store::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT attachments_json FROM case_emails WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |r| {
        let json_str: String = r.get(0)?;
        Ok(json_str)
    }).map_err(|e| e.to_string())?;

    let mut all_attachments = Vec::new();
    for row in rows {
        if let Ok(json_str) = row {
            let atts: Vec<super::types::AttachmentMetadata> = serde_json::from_str(&json_str).unwrap_or_default();
            for att in atts {
                if !att.is_imported.unwrap_or(false) {
                    all_attachments.push(att);
                }
            }
        }
    }
    Ok(all_attachments)
}
```

- [ ] **Step 5: Fix `remove_attachment`**

Current code (`apps/desktop/src-tauri/src/email/emails_ops.rs:259-323`):

```rust
#[tauri::command]
pub fn remove_attachment(
    app: AppHandle,
    case_id: i64,
    staged_path: String,
    imported_path: Option<String>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    use tauri::Emitter;

    // 1. Physically delete the file from disk if it exists
    let path = std::path::Path::new(&staged_path);
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("Failed to delete attachment from disk: {e}"))?;
    }

    // 2. Query all emails for this case
    let mut stmt = conn
        .prepare("SELECT id, attachments_json FROM case_emails WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |row| {
        let id: i64 = row.get(0)?;
        let json_str: String = row.get(1)?;
        Ok((id, json_str))
    }).map_err(|e| e.to_string())?;

    // 3. For each email, either mark as imported or filter out completely
    for row in rows {
        if let Ok((id, json_str)) = row {
            let mut atts: Vec<super::types::AttachmentMetadata> = serde_json::from_str(&json_str).unwrap_or_default();
            let mut modified = false;

            if let Some(ref imp_path) = imported_path {
                for att in &mut atts {
                    if att.staged_path == staged_path {
                        att.is_imported = Some(true);
                        att.staged_path = imp_path.clone(); // Point to the new path in case folder
                        modified = true;
                    }
                }
            } else {
                let original_len = atts.len();
                atts.retain(|att| att.staged_path != staged_path);
                if atts.len() != original_len {
                    modified = true;
                }
            }

            if modified {
                let new_json = serde_json::to_string(&atts).unwrap_or_else(|_| "[]".to_string());
                conn.execute(
                    "UPDATE case_emails SET attachments_json = ?1 WHERE id = ?2",
                    params![new_json, id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // 4. Emit the updated event so the frontend chat refreshes smoothly
    let _ = app.emit("case-emails-updated", case_id);

    Ok(())
}
```

Replace with:

```rust
#[tauri::command]
pub async fn remove_attachment(
    app: AppHandle,
    case_id: i64,
    staged_path: String,
    imported_path: Option<String>,
) -> Result<(), String> {
    // Filesystem delete + a scan over every email on the case + an update loop -- run on
    // the blocking pool so it doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || {
        remove_attachment_blocking(app, case_id, staged_path, imported_path)
    }).await
}

fn remove_attachment_blocking(
    app: AppHandle,
    case_id: i64,
    staged_path: String,
    imported_path: Option<String>,
) -> Result<(), String> {
    let conn = store::open_db(&app)?;
    use tauri::Emitter;

    // 1. Physically delete the file from disk if it exists
    let path = std::path::Path::new(&staged_path);
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("Failed to delete attachment from disk: {e}"))?;
    }

    // 2. Query all emails for this case
    let mut stmt = conn
        .prepare("SELECT id, attachments_json FROM case_emails WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![case_id], |row| {
        let id: i64 = row.get(0)?;
        let json_str: String = row.get(1)?;
        Ok((id, json_str))
    }).map_err(|e| e.to_string())?;

    // 3. For each email, either mark as imported or filter out completely
    for row in rows {
        if let Ok((id, json_str)) = row {
            let mut atts: Vec<super::types::AttachmentMetadata> = serde_json::from_str(&json_str).unwrap_or_default();
            let mut modified = false;

            if let Some(ref imp_path) = imported_path {
                for att in &mut atts {
                    if att.staged_path == staged_path {
                        att.is_imported = Some(true);
                        att.staged_path = imp_path.clone(); // Point to the new path in case folder
                        modified = true;
                    }
                }
            } else {
                let original_len = atts.len();
                atts.retain(|att| att.staged_path != staged_path);
                if atts.len() != original_len {
                    modified = true;
                }
            }

            if modified {
                let new_json = serde_json::to_string(&atts).unwrap_or_else(|_| "[]".to_string());
                conn.execute(
                    "UPDATE case_emails SET attachments_json = ?1 WHERE id = ?2",
                    params![new_json, id],
                ).map_err(|e| e.to_string())?;
            }
        }
    }

    // 4. Emit the updated event so the frontend chat refreshes smoothly
    let _ = app.emit("case-emails-updated", case_id);

    Ok(())
}
```

- [ ] **Step 6: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. `AppHandle`, `i64`, `String`, `Option<String>` are all owned `Send + 'static` types, satisfying `run_blocking`'s bound in every closure above.

- [ ] **Step 7: Test/verification**

No existing test in `apps/desktop/src-tauri/tests/` touches any of these five command-level functions directly (the `tests/email/` subdirectory holds only `fixtures/`, and `email/emails_alerts.rs`'s own `#[cfg(test)] mod tests` block tests `refresh_alert_suggestions` directly, not any of the five `#[tauri::command]` functions above). Verification is `cargo check`/`cargo build`, plus a manual smoke test: open the email inbox/alerts panel, confirm pending alerts still list and clean up spam correctly, confirm dismissing/deleting an alert still removes its staged folder, and confirm a case's email thread and its attachments list/remove correctly.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/email/emails_alerts.rs apps/desktop/src-tauri/src/email/emails_ops.rs
git commit -m "Run email alert and attachment commands on the blocking pool"
```

---

## Final Verification

- [ ] Run the full test suite once more end to end: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --no-fail-fast` (use `--no-fail-fast` — the two pre-existing, unrelated `extractor::metadata` Hebrew-test failures and the two pre-existing `USE_FTS_ONLY`-caused failures from the already-shipped plan will otherwise stop the run early; confirm no *new* failures beyond those four known ones).
- [ ] Run `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` one last time on the final state.
- [ ] Confirm all 34 FIX items from `docs/performance-review/asc-189-sync-command-audit.md` are addressed (cross-check the audit's file list against this plan's 9 tasks).
- [ ] Spot-check the frontend: none of these 34 signature changes (`pub fn` → `pub async fn`) require any TypeScript change, since `invoke()` already returns a `Promise` regardless of whether the underlying Rust command is sync or async — confirm no `apps/desktop/src/` file needed touching (it shouldn't have).
