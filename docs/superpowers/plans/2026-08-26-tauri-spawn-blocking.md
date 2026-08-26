# Offload Blocking Work Off Tokio's Async Worker Pool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop synchronous, CPU-bound, and blocking-I/O work (SQLite queries, DOCX ZIP rewriting, PDF/DOCX text extraction, ONNX embedding inference) from running directly inside `async fn` Tauri commands, where it currently monopolizes Tokio's small, shared async worker pool and freezes every other in-flight command — search, background pollers, unrelated IPC calls — for the duration of the blocking call.

**Architecture:** Add one small shared helper, `blocking::run_blocking`, that moves a synchronous `FnOnce() -> Result<T, String>` onto Tauri's dedicated blocking thread pool (`tauri::async_runtime::spawn_blocking`, the same free-function API already used for the two startup tasks in Task 2 below) and returns its result to the calling `async fn`. Apply it at the specific call sites identified during the ASC-189 follow-up investigation: two fire-and-forget startup tasks, the indexer's extraction/embedding step, two `case` module commands that are almost entirely synchronous SQLite + filesystem work wearing an `async fn` signature, and the document search command. This is a threading/placement change only — no user-visible behavior changes, so each task's bar is "existing behavior is preserved," verified either by an existing/new automated test or, where no `AppHandle`-based test harness exists in this codebase today, by `cargo check`/`cargo build` plus a manual smoke test.

**Tech Stack:** Rust, Tokio (via `tauri::async_runtime`), rusqlite, existing `tests/*` integration test crates (cargo auto-discovered, no `[[test]]` entries in `Cargo.toml`).

**Spec:** `docs/performance-review/asc-189-desktop-performance-investigation.md` documents the SQLite/startup/IPC/React root causes of ASC-189. This plan implements a fifth, independently-verified root cause found in a follow-up review (not covered in that doc): zero use of `spawn_blocking` anywhere in `apps/desktop/src-tauri/src`, meaning blocking work runs on Tokio's shared async worker pool instead of its dedicated blocking pool.

## Global Constraints

- No behavior change: every refactored function must return the exact same `Ok`/`Err` values it does today for the same inputs. This is a threading-placement change, not a logic change.
- Follow the existing codebase convention of using `tauri::async_runtime::spawn` / `spawn_blocking` (already used in `lib.rs`) rather than raw `tokio::task::spawn_blocking`, for consistency.
- Do not introduce new test-mocking infrastructure (e.g. `tauri::test::mock_app`) as a side effect of this plan — it does not exist in this codebase today (confirmed: zero references), and adding it is out of scope for a threading fix. Where a function needs `AppHandle` and has no existing test coverage, verification is `cargo check`/`cargo build` + manual smoke test, matching the current state of that function.
- Preserve all existing comments; adjust wording only where the code they describe materially changed (per `.claude/rules/development-guidelines.md`).

---

## File Structure

- **Create:** `apps/desktop/src-tauri/src/blocking.rs` — the shared `run_blocking` helper, with its own unit tests.
- **Modify:** `apps/desktop/src-tauri/src/lib.rs` — declare the new module; switch the two fire-and-forget startup tasks to `spawn_blocking`.
- **Modify:** `apps/desktop/src-tauri/src/indexer/mod.rs` — wrap `extractor::extract` and `embeddings::get_passage_embeddings` in `index_file_core_impl`.
- **Modify:** `apps/desktop/src-tauri/src/case/mod.rs` — split `save_case_document_fields` and `create_new_case`'s blocking segment into private sync helpers, called via `run_blocking`.
- **Modify:** `apps/desktop/src-tauri/src/query/mod.rs` — wrap `query_search_documents_core`'s DB open + smart-search call.

---

### Task 1: Shared `run_blocking` helper

**Files:**
- Create: `apps/desktop/src-tauri/src/blocking.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs:4` (module declaration)

**Interfaces:**
- Produces: `pub async fn run_blocking<F, T>(f: F) -> Result<T, String> where F: FnOnce() -> Result<T, String> + Send + 'static, T: Send + 'static` — used by Tasks 3, 4, 5, 6 as `crate::blocking::run_blocking(move || { ... }).await?`.

- [ ] **Step 1: Write the helper with its tests**

```rust
// apps/desktop/src-tauri/src/blocking.rs

/// Runs a synchronous, potentially blocking closure on Tauri's dedicated
/// blocking thread pool instead of the shared async worker pool, then
/// returns its result to the calling `async fn`.
///
/// Use this for any SQLite, filesystem, ZIP, or CPU-bound work (text
/// extraction, embedding inference) invoked from an `async fn` Tauri
/// command. Without it, that work runs directly on one of the runtime's
/// few async worker threads with no yield points, stalling every other
/// in-flight command -- search, background pollers, unrelated IPC calls --
/// for the whole duration of the call.
pub async fn run_blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("background task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn run_blocking_returns_ok_value() {
        let result = run_blocking(|| Ok::<i32, String>(42)).await;
        assert_eq!(result, Ok(42));
    }

    #[tokio::test]
    async fn run_blocking_propagates_err() {
        let result = run_blocking(|| Err::<i32, String>("boom".to_string())).await;
        assert_eq!(result, Err("boom".to_string()));
    }

    #[tokio::test]
    async fn run_blocking_reports_panics_as_err_instead_of_crashing() {
        let result = run_blocking(|| -> Result<i32, String> { panic!("kaboom") }).await;
        assert!(result.is_err(), "a panicking closure must surface as Err, not propagate the panic");
    }
}
```

Add the module declaration in `lib.rs` (alongside the other `pub mod` lines):

```rust
pub mod store;
pub mod blocking;
pub mod auth;
```

- [ ] **Step 2: Run the new tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib blocking::tests -- --nocapture`
Expected: 3 tests pass (`run_blocking_returns_ok_value`, `run_blocking_propagates_err`, `run_blocking_reports_panics_as_err_instead_of_crashing`).

- [ ] **Step 3: Confirm the whole crate still compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/blocking.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "Add run_blocking helper for offloading sync work off the async worker pool"
```

---

### Task 2: Fix the two fire-and-forget startup tasks

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs:67-77`

**Interfaces:**
- Consumes: nothing new (does not use Task 1's helper — these are fire-and-forget, no `Result` to bubble up).

- [ ] **Step 1: Replace `spawn` with `spawn_blocking` for both calls**

Current code (`lib.rs:67-77`):

```rust
            // Pre-warm the embedding model in a background thread on startup
            tauri::async_runtime::spawn(async {
                let _ = crate::embeddings::get_embedding_model();
            });
            // Build the case-matcher indexes once on an existing profile. Off the
            // DB-open path because it rescans every document; retries next launch on
            // failure since the marker is only set on success.
            let handle_backfill = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::case::matcher_backfill::run_backfill_on_startup(&handle_backfill);
            });
```

Replace with:

```rust
            // Pre-warm the embedding model in a background thread on startup.
            // spawn_blocking (not spawn): get_embedding_model() is a synchronous,
            // CPU/IO-heavy ONNX model load with no .await inside it to yield on. As a
            // regular async task it would pin one of the runtime's few async worker
            // threads for the whole load and stall every other in-flight command
            // (search, background pollers, etc.) until it finished.
            tauri::async_runtime::spawn_blocking(|| {
                let _ = crate::embeddings::get_embedding_model();
            });
            // Build the case-matcher indexes once on an existing profile. Off the
            // DB-open path because it rescans every document; retries next launch on
            // failure since the marker is only set on success. spawn_blocking for the
            // same reason as above -- this is a synchronous full-document rescan with
            // no yield points.
            let handle_backfill = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                crate::case::matcher_backfill::run_backfill_on_startup(&handle_backfill);
            });
```

- [ ] **Step 2: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. (`run_backfill_on_startup` and `get_embedding_model` are both plain sync `fn`s, so a bare closure — no `async move` wrapper — satisfies `spawn_blocking`'s `FnOnce() -> R + Send + 'static` bound.)

- [ ] **Step 3: Manual smoke test**

Launch the desktop app (or use an already-running dev instance per project convention) and confirm the Rust process's stdout still shows the same startup diagnostics as before this change, e.g. `[case matcher] backfill complete: ... cases, ... identifiers, ... documents linked` (or `backfill skipped, cannot open db: ...` on failure) — the message content and timing relative to the window appearing should be indistinguishable from before.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "Run startup embedding warmup and case-matcher backfill on the blocking pool"
```

---

### Task 3: Fix `index_file_core_impl`'s extraction and embedding calls

**Files:**
- Modify: `apps/desktop/src-tauri/src/indexer/mod.rs:242` (extraction)
- Modify: `apps/desktop/src-tauri/src/indexer/mod.rs:353-365` (embeddings)
- Test: existing `apps/desktop/src-tauri/tests/decoupled_pipeline_test.rs` and `apps/desktop/src-tauri/tests/integration/main.rs` already call `indexer::index_file_core` end-to-end with `run_vector_embeddings: true`.

**Interfaces:**
- Consumes: `crate::blocking::run_blocking` from Task 1.

- [ ] **Step 1: Run the existing tests first to establish today's baseline**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test decoupled_pipeline_test`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test integration`
Expected: both pass on the current, unmodified code. (If either is already failing/flaky for unrelated reasons, note it before proceeding — this task must not be blamed for a pre-existing failure.)

- [ ] **Step 2: Wrap the extraction call**

Current code (`indexer/mod.rs:242`):

```rust
    // Extract text from the file
    let extracted = extractor::extract(file_path).map_err(|e| format!("extraction failed: {e}"))?;
```

Replace with:

```rust
    // Extract text from the file. Runs on the blocking pool -- PDF/DOCX
    // parsing is CPU-bound and would otherwise stall the async worker pool
    // for every other in-flight command while it runs.
    let file_path_owned = file_path.to_path_buf();
    let extracted = crate::blocking::run_blocking(move || {
        extractor::extract(&file_path_owned).map_err(|e| format!("extraction failed: {e}"))
    }).await?;
```

- [ ] **Step 3: Wrap the embedding-generation call**

Current code (`indexer/mod.rs:352-367`):

```rust
    // Track 2: Vector Embeddings generation
    if options.run_vector_embeddings && !crate::query::USE_FTS_ONLY {
        let chunks = crate::embeddings::chunk_text(&extracted.text, 1000, 200);
        if !chunks.is_empty() {
            let embeddings = crate::embeddings::get_passage_embeddings(&chunks)
                .map_err(|e| format!("Failed generating passage embeddings: {e}"))?;
            
            let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
            // Clear any prior chunks
            let _ = store::delete_document_chunks(&conn, doc_id);
            for (idx, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                let emb_bytes = crate::embeddings::vec_to_bytes(emb);
                store::insert_document_chunk(&conn, doc_id, idx as i32, chunk, &emb_bytes)
                    .map_err(|e| format!("Failed storing chunk embedding: {e}"))?;
            }
        }
    }
```

Replace with:

```rust
    // Track 2: Vector Embeddings generation
    if options.run_vector_embeddings && !crate::query::USE_FTS_ONLY {
        let chunks = crate::embeddings::chunk_text(&extracted.text, 1000, 200);
        if !chunks.is_empty() {
            // ONNX inference is CPU-bound -- same blocking-pool reasoning as the
            // extraction call above. chunks is moved in and handed back out
            // alongside the embeddings so the zip loop below can still use it.
            let (chunks, embeddings) = crate::blocking::run_blocking(move || {
                let embeddings = crate::embeddings::get_passage_embeddings(&chunks)
                    .map_err(|e| format!("Failed generating passage embeddings: {e}"))?;
                Ok((chunks, embeddings))
            }).await?;

            let conn = store::open_db_by_path(db_path).map_err(|e| e.to_string())?;
            // Clear any prior chunks
            let _ = store::delete_document_chunks(&conn, doc_id);
            for (idx, (chunk, emb)) in chunks.iter().zip(embeddings.iter()).enumerate() {
                let emb_bytes = crate::embeddings::vec_to_bytes(emb);
                store::insert_document_chunk(&conn, doc_id, idx as i32, chunk, &emb_bytes)
                    .map_err(|e| format!("Failed storing chunk embedding: {e}"))?;
            }
        }
    }
```

- [ ] **Step 4: Re-run the same tests and confirm they still pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test decoupled_pipeline_test`
Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test integration`
Expected: both pass, with identical results to Step 1's baseline (same documents indexed, same chunk counts) — this is a threading change, not a logic change.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/indexer/mod.rs
git commit -m "Run text extraction and embedding generation on the blocking pool during indexing"
```

---

### Task 4: Fix `case::save_case_document_fields`

**Files:**
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:774-913`

**Interfaces:**
- Consumes: `crate::blocking::run_blocking` from Task 1.

**Note:** This command has no `.await` anywhere in its current body (verified: `sed -n '774,913p' case/mod.rs | grep '\.await'` returns nothing) — it is entirely synchronous SQLite + filesystem + ZIP work wearing an `async fn` signature. It also has no existing automated test today (only the lower-level `store::create_tasks_for_new_case` is tested elsewhere in `tests/`), and testing it directly would require a `tauri::test::mock_app()`-based `AppHandle`, which this codebase does not currently use anywhere (see Global Constraints — not introducing that here). Verification for this task is `cargo check`/`cargo build` plus a manual smoke test, matching the current state of this function.

- [ ] **Step 1: Extract the current body into a private sync helper**

Current code (`case/mod.rs:774-913`):

```rust
pub async fn save_case_document_fields(
    app: AppHandle,
    case_id: i64,
    file_name: String,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use tauri::Emitter;

    // 1. Open DB first
    let conn = store::open_db(&app)?;

    // ... (unchanged body, verbatim through the closing brace)
}
```

Replace the whole function with:

```rust
#[tauri::command]
pub async fn save_case_document_fields(
    app: AppHandle,
    case_id: i64,
    file_name: String,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    // Entirely synchronous SQLite + filesystem + ZIP work -- run on the blocking
    // pool so it doesn't stall every other in-flight command while it runs.
    crate::blocking::run_blocking(move || {
        save_case_document_fields_blocking(app, case_id, file_name, fields)
    }).await
}

fn save_case_document_fields_blocking(
    app: AppHandle,
    case_id: i64,
    file_name: String,
    fields: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use tauri::Emitter;

    // 1. Open DB first
    let conn = store::open_db(&app)?;

    // 2. Save fields to case_fields
    for (key, val) in &fields {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![case_id, key, val],
        ).map_err(|e| format!("[save_case_document_fields] {e}"))?;
    }

    // 3. Load all fields for this case to merge them
    let mut all_fields = std::collections::HashMap::new();
    let mut stmt = conn
        .prepare("SELECT field_name, field_value FROM case_fields WHERE case_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![case_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok((name, val)) = r {
            all_fields.insert(name, val);
        }
    }

    // 4. Find the template path for this file name
    let mut doc_stmt = conn
        .prepare("SELECT marked_path, file_ext FROM doc_templates WHERE file_name = ?1")
        .map_err(|e| e.to_string())?;
    let (marked_path_str, file_ext): (String, String) = doc_stmt
        .query_row(params![file_name], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| format!("Failed to find doc template with file_name {file_name}: {e}"))?;

    // 5. Get folder path for the case
    let folder_path: String = conn.query_row(
        "SELECT folder FROM cases WHERE id = ?1",
        params![case_id],
        |row| row.get(0)
    ).map_err(|e| format!("Failed to find case: {e}"))?;

    let dest_path = Path::new(&folder_path).join(&file_name);

    // 6. Create version backup of the active file before overwriting (if it exists)
    if dest_path.exists() {
        if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(
            &app,
            &dest_path,
            Some("State before document fields update".to_string()),
            true,
            false,
        ) {
            println!("Failed to create document version backup before update: {}", e);
        }
    }

    // 7. Regenerate the file from template with updated merged fields
    let marked_path = Path::new(&marked_path_str);
    if !marked_path.exists() {
        return Err(format!("Template file not found at {marked_path_str}"));
    }

    if file_ext == "docx" {
        let original_bytes = std::fs::read(marked_path)
            .map_err(|e| format!("Failed to read marked docx: {e}"))?;

        let cursor = std::io::Cursor::new(original_bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Cannot open marked docx ZIP: {e}"))?;

        let doc_xml = {
            let mut f = archive
                .by_name("word/document.xml")
                .map_err(|_| "word/document.xml not found".to_string())?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };

        let mut new_doc_xml = doc_xml;
        new_doc_xml = crate::doc_template::replace_docx_placeholders(&new_doc_xml, &all_fields);

        let out_buf: Vec<u8> = Vec::new();
        let out_cursor = std::io::Cursor::new(out_buf);
        let mut new_zip = zip::ZipWriter::new(out_cursor);

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();
            let opts = zip::write::FileOptions::<()>::default()
                .compression_method(file.compression());

            if file.is_dir() {
                new_zip.add_directory(&name, opts).map_err(|e| e.to_string())?;
            } else {
                new_zip.start_file(&name, opts).map_err(|e| e.to_string())?;
                if name == "word/document.xml" {
                    new_zip
                        .write_all(new_doc_xml.as_bytes())
                        .map_err(|e| e.to_string())?;
                } else {
                    let mut content = Vec::new();
                    file.read_to_end(&mut content).map_err(|e| e.to_string())?;
                    new_zip.write_all(&content).map_err(|e| e.to_string())?;
                }
            }
        }

        let out_cursor = new_zip.finish().map_err(|e| e.to_string())?;
        let output_bytes = out_cursor.into_inner();

        std::fs::write(&dest_path, &output_bytes)
            .map_err(|e| format!("Failed to write generated DOCX: {e}"))?;
    } else {
        let mut text = std::fs::read_to_string(marked_path)
            .map_err(|e| format!("Failed to read marked text template: {e}"))?;

        for (key, val) in &all_fields {
            text = text.replace(&format!("[[{key}]]"), val);
        }

        std::fs::write(&dest_path, text)
            .map_err(|e| format!("Failed to write generated text: {e}"))?;
    }

    // 8. Emit change notification to frontend
    let _ = app.emit("case-files-changed", ());

    Ok(())
}
```

**Important — verify this exactly against the file before editing:** read `case/mod.rs:774-913` immediately before making this change and diff it against the "current code" block above. This plan was written against a snapshot of that range; if anything else has touched `save_case_document_fields` in the meantime, carry those changes into `save_case_document_fields_blocking` rather than reverting them.

- [ ] **Step 2: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. In particular, confirm `AppHandle`, `std::collections::HashMap<String, String>`, and `zip::ZipArchive<std::io::Cursor<Vec<u8>>>` are all `Send` (they are — none hold non-`Send` types), satisfying `run_blocking`'s bound.

- [ ] **Step 3: Manual smoke test**

Via the running desktop app: open a case that has at least one generated document from a template, edit one of its fields in the UI, save, and confirm the regenerated `.docx`/text file on disk reflects the new field value exactly as it did before this change, and that the case view still refreshes (the `case-files-changed` event still fires).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/case/mod.rs
git commit -m "Run save_case_document_fields on the blocking pool"
```

---

### Task 5: Fix `case::create_new_case`'s blocking segment

**Files:**
- Modify: `apps/desktop/src-tauri/src/case/mod.rs:128-337`

**Interfaces:**
- Consumes: `crate::blocking::run_blocking` from Task 1.
- Produces: private `fn create_new_case_blocking(app: AppHandle, subject: String, name: String, folder: String, case_template_id: Option<i64>, task_template_id: Option<i64>, tasks: Option<Vec<store::NewTaskInput>>, field_values: std::collections::HashMap<String, String>) -> Result<CreateCaseResult, String>`.

**Note:** Unlike Task 4, this function has one `.await` partway through (the per-email `contact::create_contact(...).await` loop, `case/mod.rs:309-321`) — a best-effort, already-async step that must stay on the async side (it may itself call out over IPC/DB, and its own failures are deliberately swallowed into warnings rather than propagated). Only the fully-synchronous segment before that loop — DB inserts, task materialization, and the template copy/ZIP-rewrite — moves to the blocking pool. Same test-coverage gap as Task 4 applies here (no existing test exercises the full `create_new_case` command); verification is `cargo check`/`cargo build` plus a manual smoke test.

- [ ] **Step 1: Split the function**

Current code (`case/mod.rs:128-337`, abridged — the full body is the synchronous DB/filesystem/ZIP logic already read from the file, ending at the `Ok(CreateCaseResult { ... })` for the contact-warnings loop):

```rust
#[tauri::command]
pub async fn create_new_case(
    app: AppHandle,
    subject: String,
    name: String,
    folder: String,
    case_template_id: Option<i64>,
    task_template_id: Option<i64>,
    tasks: Option<Vec<store::NewTaskInput>>,
    field_values: std::collections::HashMap<String, String>,
    contact_emails: Option<Vec<String>>,
) -> Result<CreateCaseResult, String> {
    let contact_emails = contact_emails.unwrap_or_default();
    // 1. Open DB first and verify that this folder path is not already in use by another active case
    let conn = store::open_db(&app)?;
    // ... (all synchronous DB/filesystem/ZIP logic, unchanged, through:)
    // ... "3. If a template is chosen, copy then fill documents" block ends here ...

    // Create/link a contact for each supplied client email (design.md §4.4). ...
    let mut contact_warnings = Vec::new();
    for email in &contact_emails {
        let email = email.trim();
        if email.is_empty() {
            continue;
        }
        match crate::contact::create_contact(app.clone(), None, email.to_string(), None, None, None, None).await {
            Ok(contact) => {
                if let Err(e) =
                    crate::contact::add_contact_to_case(app.clone(), id, contact.id, "case_creation".to_string())
                {
                    contact_warnings.push(format!("Could not add contact for {email}: {e}"));
                }
            }
            Err(e) => {
                contact_warnings.push(format!("Could not add contact for {email}: {e}"));
            }
        }
    }

    Ok(CreateCaseResult {
        case: Case {
            id,
            subject: Some(subject),
            status: "open".to_string(),
            name,
            created_at,
            updated_at: None,
            folder: Some(folder),
            notes: None,
            tags: vec![case_id_tag],
        },
        contact_warnings,
    })
}
```

Replace with (the command function shrinks to: run the blocking segment, then run the contact loop against its result):

```rust
#[tauri::command]
pub async fn create_new_case(
    app: AppHandle,
    subject: String,
    name: String,
    folder: String,
    case_template_id: Option<i64>,
    task_template_id: Option<i64>,
    tasks: Option<Vec<store::NewTaskInput>>,
    field_values: std::collections::HashMap<String, String>,
    contact_emails: Option<Vec<String>>,
) -> Result<CreateCaseResult, String> {
    // `Option` (not a bare `Vec`) so Tauri defaults a missing `contactEmails` IPC key to
    // `None` instead of erroring -- required so the existing frontend caller, which does not
    // yet send this key, keeps working unchanged until a later PR wires it up.
    let contact_emails = contact_emails.unwrap_or_default();

    // The case row, its fields/tasks, and any template documents are all synchronous
    // DB/filesystem/ZIP work -- run on the blocking pool so it doesn't stall every
    // other in-flight command while it runs. Only the best-effort contact-linking
    // loop below (which awaits its own async command) stays on the async side.
    let mut result = crate::blocking::run_blocking({
        let app = app.clone();
        move || {
            create_new_case_blocking(
                app,
                subject,
                name,
                folder,
                case_template_id,
                task_template_id,
                tasks,
                field_values,
            )
        }
    }).await?;

    // Create/link a contact for each supplied client email (design.md §4.4). Case creation
    // itself has already succeeded above and must never roll back over this -- each failure
    // (create or link) is collected as a warning instead of propagated with `?`. Empty/
    // whitespace-only entries are skipped silently: the frontend caller is expected to have
    // already trimmed/filtered, but this is a public command surface, so defend here too.
    for email in &contact_emails {
        let email = email.trim();
        if email.is_empty() {
            continue;
        }
        match crate::contact::create_contact(app.clone(), None, email.to_string(), None, None, None, None).await {
            Ok(contact) => {
                if let Err(e) =
                    crate::contact::add_contact_to_case(app.clone(), result.case.id, contact.id, "case_creation".to_string())
                {
                    result.contact_warnings.push(format!("Could not add contact for {email}: {e}"));
                }
            }
            Err(e) => {
                result.contact_warnings.push(format!("Could not add contact for {email}: {e}"));
            }
        }
    }

    Ok(result)
}

fn create_new_case_blocking(
    app: AppHandle,
    subject: String,
    name: String,
    folder: String,
    case_template_id: Option<i64>,
    task_template_id: Option<i64>,
    tasks: Option<Vec<store::NewTaskInput>>,
    field_values: std::collections::HashMap<String, String>,
) -> Result<CreateCaseResult, String> {
    // 1. Open DB first and verify that this folder path is not already in use by another active case
    let conn = store::open_db(&app)?;
    let folder_exists: bool = conn.query_row(
        "SELECT COUNT(1) FROM cases WHERE folder = ?1 AND (deleted = 0 OR deleted IS NULL)",
        params![folder],
        |row| row.get(0)
    ).unwrap_or(0) > 0;

    if folder_exists {
        return Err("A case with this storage directory path already exists.".to_string());
    }

    // 2. Create case directory
    let case_path = Path::new(&folder);
    std::fs::create_dir_all(case_path)
        .map_err(|e| format!("Failed to create case directory: {e}"))?;

    // 3. Insert case record
    let created_at = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO cases (subject, status, name, created_at, folder) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![subject, "open", name, created_at, folder],
    ).map_err(|e| format!("[insert case] {e}"))?;
    let id = conn.last_insert_rowid();
    let case_id_tag = upsert_tag_internal(&app, TagScope::Case(id), "case_id", Some(&id.to_string()), TagType::System)?;

    // Save fields to case_fields
    for (key, val) in &field_values {
        conn.execute(
            "INSERT OR REPLACE INTO case_fields (case_id, field_name, field_value) VALUES (?1, ?2, ?3)",
            params![id, key, val],
        ).map_err(|e| format!("[insert case field] {e}"))?;
    }

    refresh_case_matcher_indexes(&conn, id);

    // If the caller reviewed/edited a task template's tasks before submitting
    // (the case-creation UI's task review panel), those explicit tasks take
    // priority over blindly materializing the template as-is.
    if let Some(task_inputs) = &tasks {
        store::create_tasks_for_new_case(&conn, id, &created_at, task_inputs)
            .map_err(|e| format!("[create tasks] {e}"))?;
    } else if let Some(tt_id) = task_template_id {
        store::materialize_tasks_from_template(&conn, id, tt_id, &created_at)
            .map_err(|e| format!("[materialize tasks] {e}"))?;
    }

    // 3. If a template is chosen, copy then fill documents
    if let Some(ct_id) = case_template_id {
        // Find document template IDs associated with the case template
        let mut stmt = conn
            .prepare("SELECT template_id FROM case_template_docs WHERE case_template_id = ?1")
            .map_err(|e| e.to_string())?;

        let doc_ids: Vec<i64> = stmt
            .query_map(params![ct_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<i64>, _>>()
            .map_err(|e| e.to_string())?;

        for doc_id in doc_ids {
            // Get template document details
            let mut doc_stmt = conn
                .prepare("SELECT marked_path, file_name, file_ext FROM doc_templates WHERE id = ?1")
                .map_err(|e| e.to_string())?;

            let (marked_path_str, file_name, file_ext): (String, String, String) = doc_stmt
                .query_row(params![doc_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })
                .map_err(|e| format!("Failed to find doc template with ID {doc_id}: {e}"))?;

            let marked_path = Path::new(&marked_path_str);
            if !marked_path.exists() {
                return Err(format!("Template file not found at {marked_path_str}"));
            }

            // Destination filename without .marked (we use original file_name)
            let dest_path = case_path.join(&file_name);

            // Copy marked template file first
            std::fs::copy(marked_path, &dest_path)
                .map_err(|e| format!("Failed to copy template to {}: {e}", dest_path.display()))?;

            // Replace field values in-place on the copied file
            if file_ext == "docx" {
                let original_bytes = std::fs::read(&dest_path)
                    .map_err(|e| format!("Failed to read copied docx: {e}"))?;

                let cursor = std::io::Cursor::new(original_bytes);
                let mut archive = zip::ZipArchive::new(cursor)
                    .map_err(|e| format!("Cannot open copied docx ZIP: {e}"))?;

                let doc_xml = {
                    let mut f = archive
                        .by_name("word/document.xml")
                        .map_err(|_| "word/document.xml not found".to_string())?;
                    let mut s = String::new();
                    f.read_to_string(&mut s).map_err(|e| e.to_string())?;
                    s
                };

                let mut new_doc_xml = doc_xml;
                new_doc_xml = crate::doc_template::replace_docx_placeholders(&new_doc_xml, &field_values);

                let out_buf: Vec<u8> = Vec::new();
                let out_cursor = std::io::Cursor::new(out_buf);
                let mut new_zip = zip::ZipWriter::new(out_cursor);

                for i in 0..archive.len() {
                    let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                    let name = file.name().to_string();
                    let opts = zip::write::FileOptions::<()>::default()
                        .compression_method(file.compression());

                    if file.is_dir() {
                        new_zip.add_directory(&name, opts).map_err(|e| e.to_string())?;
                    } else {
                        new_zip.start_file(&name, opts).map_err(|e| e.to_string())?;
                        if name == "word/document.xml" {
                            new_zip
                                .write_all(new_doc_xml.as_bytes())
                                .map_err(|e| e.to_string())?;
                        } else {
                            let mut content = Vec::new();
                            file.read_to_end(&mut content).map_err(|e| e.to_string())?;
                            new_zip.write_all(&content).map_err(|e| e.to_string())?;
                        }
                    }
                }

                let out_cursor = new_zip.finish().map_err(|e| e.to_string())?;
                let output_bytes = out_cursor.into_inner();

                std::fs::write(&dest_path, &output_bytes)
                    .map_err(|e| format!("Failed to write generated DOCX: {e}"))?;
            } else {
                let mut text = std::fs::read_to_string(&dest_path)
                    .map_err(|e| format!("Failed to read copied text template: {e}"))?;

                for (key, val) in &field_values {
                    text = text.replace(&format!("[[{key}]]"), val);
                }

                std::fs::write(&dest_path, text)
                    .map_err(|e| format!("Failed to write generated text: {e}"))?;
            }

            if let Err(e) = crate::documents::versioning::create_document_backup_if_exists(&app, &dest_path, Some("Original Version".to_string()), true, true) {
                println!("Failed to create document version backup on create_new_case: {}", e);
            }
        }
    }

    Ok(CreateCaseResult {
        case: Case {
            id,
            subject: Some(subject),
            status: "open".to_string(),
            name,
            created_at,
            updated_at: None,
            folder: Some(folder),
            notes: None,
            tags: vec![case_id_tag],
        },
        contact_warnings: Vec::new(),
    })
}
```

**Important — verify this exactly against the file before editing:** read `case/mod.rs:128-337` immediately before making this change and diff it against the "current code" block above (which is abridged for readability here). This plan was written against a snapshot of that range; carry forward any changes made to `create_new_case` since then rather than reverting them.

- [ ] **Step 2: Confirm the crate compiles**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: no errors. In particular:
- `create_new_case_blocking`'s return type is `Result<CreateCaseResult, String>`, matching `run_blocking`'s `F: FnOnce() -> Result<T, String>` bound with `T = CreateCaseResult`.
- `CreateCaseResult` (and its `Case`/`Tag` fields) must be `Send` — they're plain `Serialize`/`Deserialize` data structs with `String`/`i64`/`Option`/`Vec` fields, so this holds without changes.
- The outer `run_blocking` closure captures `app` (cloned beforehand so the original `app` remains available for the contact loop), plus `subject`, `name`, `folder`, `case_template_id`, `task_template_id`, `tasks`, `field_values` by move — all owned, `'static`-safe values already.

- [ ] **Step 3: Manual smoke test**

Via the running desktop app: create a new case (a) with a case template selected that has at least one `.docx` and one plain-text template document, and (b) with one or more client contact emails supplied. Confirm: the case is created, its folder and generated documents exist and have field placeholders correctly filled, any task template materializes tasks (or explicit reviewed tasks are used instead, if supplied), and contacts are created/linked with the same behavior as before (including that an invalid/duplicate contact still surfaces as a `contact_warnings` entry rather than failing the whole case creation).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/case/mod.rs
git commit -m "Run create_new_case's DB/filesystem/ZIP work on the blocking pool"
```

---

### Task 6: Fix `query::query_search_documents_core`

**Files:**
- Modify: `apps/desktop/src-tauri/src/query/mod.rs:20-45`
- Test: Create `apps/desktop/src-tauri/tests/query/query_search_documents_core_test.rs`
- Modify: `apps/desktop/src-tauri/tests/query/main.rs` (add `mod query_search_documents_core_test;`)

**Interfaces:**
- Consumes: `crate::blocking::run_blocking` from Task 1.

This is the hot path for every search-bar keystroke (once debounced on the frontend) — it currently re-runs the full SQLite DDL migration (via `open_db_by_path`) and the FTS/vector search synchronously inside an `async fn`, on every call. Unlike Tasks 4/5, this function takes `db_path: &Path` directly with no `AppHandle`, so it's directly and easily testable without any new test infrastructure — following the exact pattern already used in `tests/query/query_smart_execute_test.rs`.

- [ ] **Step 1: Write the new test (should pass against today's code, unmodified)**

```rust
// apps/desktop/src-tauri/tests/query/query_search_documents_core_test.rs

use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::{
    llm::llm_provider::{LlmProvider, MockProvider},
    query::{query_search_documents_core, SearchOptions},
    store,
};

fn insert_test_doc(conn: &Connection, path: &str, title: &str, text: &str) {
    let record = store::DocumentRecord {
        file_path: path.to_string(),
        file_name: path.to_string(),
        file_ext: "txt".to_string(),
        file_size_kb: 1,
        doc_type: Some("contract".to_string()),
        title: Some(title.to_string()),
        summary: Some("Test summary".to_string()),
        authors: "[]".to_string(),
        doc_date: None,
        topics: "[]".to_string(),
        entities: "[]".to_string(),
        keywords: "[]".to_string(),
        language: Some("en".to_string()),
        page_count: Some(1),
        confidence: None,
        raw_metadata: "{}".to_string(),
        raw_text: text.to_string(),
    };
    store::insert_document(conn, &record).expect("Should insert test document");
}

#[tokio::test]
async fn query_search_documents_core_finds_matching_document_via_fts() {
    let db_path = Path::new("tests/query/query_search_documents_core_test.db");
    if db_path.exists() {
        std::fs::remove_file(db_path).unwrap();
    }
    let conn = store::open_db_by_path(db_path).expect("Should open full-schema test db");

    insert_test_doc(
        &conn,
        "rental_contract.txt",
        "Rental Lease Contract",
        "This is an apartment rental lease agreement.",
    );
    insert_test_doc(
        &conn,
        "medical_report.txt",
        "Medical Clinical Report",
        "Patient clinical diagnostic test details.",
    );
    drop(conn);

    let provider = LlmProvider::Mock(MockProvider);
    let options = SearchOptions {
        use_llm_query_analysis: false,
        use_llm_rerank: false,
    };

    let results = query_search_documents_core(db_path, &provider, "rental lease contract", 5, &options, None, None)
        .await
        .expect("search should succeed");

    assert!(!results.is_empty(), "should find at least one matching document");
    assert!(
        results.iter().any(|d| d.file_name == "rental_contract.txt"),
        "should find the rental contract"
    );
    assert!(
        !results.iter().any(|d| d.file_name == "medical_report.txt"),
        "should not return the unrelated medical report"
    );

    let _ = std::fs::remove_file(db_path);
}
```

Add it to the test crate's module list (current contents of `main.rs` shown in full — just append the last line):

```rust
// apps/desktop/src-tauri/tests/query/main.rs
#[path = "../common/mod.rs"]
mod common;
mod query_by_fts_test;
mod query_by_vector_test;
mod query_smart_execute_test;
mod query_search_documents_core_test;
```

- [ ] **Step 2: Run it against today's unmodified code to confirm it passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test query query_search_documents_core_finds_matching_document_via_fts -- --nocapture`
Expected: PASS. (This locks down current behavior before the refactor — it is not new behavior, so it must already pass.)

- [ ] **Step 3: Wrap the DB open + search call**

Current code (`query/mod.rs:20-45`):

```rust
pub async fn query_search_documents_core(
    db_path: &Path,
    provider: &LlmProvider,
    query: &str,
    limit: usize,
    options: &SearchOptions,
    tags: Option<&[TagFilter]>,
    notes_contains: Option<&str>,
) -> Result<Vec<DocumentRow>, String> {
    let analysis = if options.use_llm_query_analysis && !USE_FTS_ONLY {
        llm::query_llm_analyze_query(query, provider).await?
    } else {
        llm::analyze_query_heuristically(query)
    };

    let local_results = {
        let conn = store::open_db_by_path(db_path)?;
        queries::query_smart_execute(&conn, &analysis, query, tags, notes_contains, limit * 2)
    };

    if options.use_llm_rerank && !USE_FTS_ONLY {
        llm::query_llm_rerank_candidates(query, local_results, provider).await
    } else {
        Ok(local_results)
    }
}
```

Replace with:

```rust
pub async fn query_search_documents_core(
    db_path: &Path,
    provider: &LlmProvider,
    query: &str,
    limit: usize,
    options: &SearchOptions,
    tags: Option<&[TagFilter]>,
    notes_contains: Option<&str>,
) -> Result<Vec<DocumentRow>, String> {
    let analysis = if options.use_llm_query_analysis && !USE_FTS_ONLY {
        llm::query_llm_analyze_query(query, provider).await?
    } else {
        llm::analyze_query_heuristically(query)
    };

    // Re-opening the DB re-runs schema/DDL checks, and query_smart_execute is a
    // synchronous SQLite scan -- both run on the blocking pool so a search on
    // every keystroke doesn't stall every other in-flight command while it runs.
    let db_path_owned = db_path.to_path_buf();
    let query_owned = query.to_string();
    let tags_owned = tags.map(|t| t.to_vec());
    let notes_owned = notes_contains.map(|s| s.to_string());

    let local_results = crate::blocking::run_blocking(move || {
        let conn = store::open_db_by_path(&db_path_owned)?;
        Ok(queries::query_smart_execute(
            &conn,
            &analysis,
            &query_owned,
            tags_owned.as_deref(),
            notes_owned.as_deref(),
            limit * 2,
        ))
    }).await?;

    if options.use_llm_rerank && !USE_FTS_ONLY {
        llm::query_llm_rerank_candidates(query, local_results, provider).await
    } else {
        Ok(local_results)
    }
}
```

- [ ] **Step 4: Re-run the new test and confirm it still passes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test query query_search_documents_core_finds_matching_document_via_fts -- --nocapture`
Expected: PASS, identical results to Step 2.

- [ ] **Step 5: Run the rest of the query test crate to confirm no regressions**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test query`
Expected: all pass (`query_smart_execute_test`'s existing tests are untouched by this change, since `query_smart_execute` itself wasn't modified).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/query/mod.rs apps/desktop/src-tauri/tests/query/query_search_documents_core_test.rs apps/desktop/src-tauri/tests/query/main.rs
git commit -m "Run query_search_documents_core's DB search on the blocking pool"
```

---

## Final Verification

- [ ] Run the full test suite once more end to end: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- [ ] Run `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` one last time on the final state.
- [ ] Confirm `grep -rn "spawn_blocking" apps/desktop/src-tauri/src` now shows exactly the 6 new call sites added by this plan (Task 1's helper implementation, Task 2's two startup spawns are `spawn_blocking` calls directly — not via the helper — and Tasks 3/4/5/6's four `run_blocking` call sites use the helper, which itself calls `spawn_blocking` once).
