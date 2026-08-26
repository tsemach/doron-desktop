# Sync Tauri Command Audit

*Line numbers below are as of commit `81f31be` (master, immediately after PR #229 merged) — the branch that implements this audit's 34 FIX items shifts most of them; treat this file as a point-in-time record, not a live index.*

## Summary
- Total plain `pub fn` commands audited: 83
- FIX: 34
- TRIVIAL: 49
- UNCLEAR: 0

All 83 were read directly (not sampled). `org/mod.rs`'s 10 commands and `contact/google_people.rs`'s 1 command are already `pub async fn` and awaiting real network I/O correctly — not part of the 83, no action needed there.

## FIX (grouped by module/file)

### apps/desktop/src-tauri/src/case/mod.rs
- `list_cases` (line 64): loads every non-deleted case (id/subject/status/name/dates/folder + LEFT JOIN case_annotations for notes), then bulk-attaches tags. Full-table scan across all cases — likely the single most frequently invoked command in the app (populates the main Case Management screen on every navigation). ~40 lines. Near-duplicate of `case::lookup::load_active_cases` (case/lookup.rs:53) — worth deduplicating in the same pass.
- `list_case_files` (line 405): `std::fs::read_dir` over a case folder, then per file: up to 3 separate SQL queries (title from `documents`, fallback title from `doc_templates`, notes from `document_annotations`) plus a tags lookup — a real N+1 pattern multiplied by however many files are in the case folder, plus `fs::metadata` per file. ~95 lines. One of the more expensive candidates.
- `add_file_to_case` (line 584): `std::fs::copy` (unbounded file size) plus 1-2 calls into `documents::versioning::create_document_backup_if_exists` (itself unaudited here, but does file I/O per Task 4's sibling functions). ~55 lines.
- `save_case_fields` (line 666): loop of `INSERT OR REPLACE` (one per field) + `refresh_case_matcher_indexes` (multi-statement index rebuild). Bounded by field count per case (typically small) but a real loop.
- `remove_file_from_case` (line 684): the largest candidate in this file. Sequential SQL queries, `fs::remove_file`, a loop deleting every version file from disk, more DB deletes, then (for template files) a second folder scan with a nested per-remaining-file DB query loop. ~115 lines — comparable in size/complexity to `create_new_case`, which this PR already fixed.
- `read_file_bytes` (line 802): single `std::fs::read` but no size cap — reads whole documents (PDFs/DOCX can be multi-MB) into memory synchronously. Small function, but the blocking call itself can be slow for large files.

### apps/desktop/src-tauri/src/case/annotations.rs
- `set_case_annotations` (line 36): 1 insert + `refresh_case_matcher_indexes` (rebuilds this case's identifier index and text-search FTS row — more than a single statement, cost unaudited beyond "more than trivial").

### apps/desktop/src-tauri/src/case/lookup.rs
- `resolve_cases_for_paths` (line 119): calls `load_active_cases` — same full-table case scan as `case::list_cases` above, then loops over input paths matching folders. Cost scales with total case count, not just input size.
- `search_cases` (line 169): same `load_active_cases` full-table scan, then in-memory filter/sort.

### apps/desktop/src-tauri/src/case_template/mod.rs
- `list_case_templates` (line 5) → `store::list_case_templates`: N+1 — a per-template query for its associated doc-template ids, inside the row loop. Typically few case templates per firm, so low urgency, but the exact anti-pattern already fixed elsewhere in this PR.
- `create_case_template` (line 11): insert + loop inserting doc-template-id links. Bounded (a handful of docs per template) — low urgency, easy mechanical fix.
- `update_case_template` (line 22): 2 statements + delete-all/reinsert loop for doc-template-id links. Same bounded/low-urgency profile as create.

### apps/desktop/src-tauri/src/calendar/mod.rs
- `list_meetings_for_range` (line 209) → `store::list_meetings_for_range`: N+1 — `with_attendees(conn, row)` runs one extra query per meeting row returned. This is the calendar day/week/month view's data source — could return dozens of meetings per query.
- `list_meetings_for_case` (line 215): same N+1 attendees pattern, scoped to one case (usually fewer rows, same anti-pattern).
- `list_todays_meetings` (line 221): delegates to `list_meetings_for_range` — inherits the same N+1.

### apps/desktop/src-tauri/src/doc_template/context.rs
- `get_template_field_context` (line 6): calls `extractor::extract()` on the template file — the same CPU-bound PDF/DOCX parsing this PR already wrapped in `run_blocking` inside the indexer (Task 3). Identical shape of bug, different call site.

### apps/desktop/src-tauri/src/doc_template/mod.rs
- `sync_template_fields` (line 468) → `sync_single_template_internal`: calls `extractor::extract()` on one template file. Same CPU-bound extraction bug as above.
- `sync_all_templates_fields` (line 483): loops over **every** template in the firm, calling `sync_single_template_internal` (and therefore `extractor::extract()`) for each. Worst case in this file — cost scales linearly with template count, each iteration doing real CPU-bound parsing.
- `open_path` (line 698) → `open_path_impl`/`try_open_via_wsl`: on Linux/WSL, synchronously spawns and waits on up to three external processes (`wslpath`, `powershell.exe`, `wslview`) via `std::process::Command::…().output()`. This is not DB/FS work but is a textbook blocking call — process spawn + wait can easily run into hundreds of ms, and on non-WSL Linux/macOS it still blocks on the `opener` plugin call. Arguably the single worst individual blocking operation found in this audit.
- `delete_template` (line 776): query + up to 2 `std::fs::remove_file` calls + 1 delete.

### apps/desktop/src-tauri/src/documents/versioning.rs
- `list_document_versions` (line 375): query, then `calculate_md5(active_path)` — reads and hashes the *current* file on disk (could be multi-MB) for every call, in addition to the version-history query.
- `restore_document_version` (line 421): query + `create_document_backup_if_exists` (file I/O) + `fs::copy`.
- `delete_document_version` (line 457): query + `fs::remove_file` + delete.

### apps/desktop/src-tauri/src/email/emails_alerts.rs
- `list_pending_email_alerts` (line 159): queries alerts to clean up, then for each one: `fs::remove_dir_all` on a staging folder + 2 `INSERT OR IGNORE` statements. Loop combining FS and DB work.
- `delete_email_alert` (line 422): 4 sequential statements (1 query, 2 inserts, 1 delete) for a single alert — bounded but multiple round trips.

### apps/desktop/src-tauri/src/email/emails_ops.rs
- `list_case_emails` (line 10): single query, but scans **all** emails ever received for a case (unbounded, grows over the case's lifetime) including full `body_text`/`body_html` blobs.
- `list_case_attachments` (line 234): same unbounded per-case email scan, plus a `serde_json::from_str` parse per row.
- `remove_attachment` (line 260): `fs::remove_file` + a query over all of a case's emails + an update loop over matching rows.

### apps/desktop/src-tauri/src/tags/mod.rs
- `list_tag_values` (line 265): `SELECT DISTINCT value ... WHERE name = ?1` — scans the entire `tags` table for that name across every case/document in the database, not scoped to one entity. Unbounded as the firm's data grows.
- `list_all_tag_names` (line 277): same shape — `SELECT DISTINCT name` across the whole table (optionally filtered by type, still unscoped to an entity).

### apps/desktop/src-tauri/src/task/mod.rs
- `reorder_tasks` (line 69) → `store::reorder_tasks`: loop of `UPDATE ... sort_order` inside a transaction, one per task id. Bounded by tasks-per-case (typically small) — low urgency, mechanical fix.
- `list_all_tasks` (line 75): no case filter — scans tasks across **every** case in the firm, presumably for a global "my tasks"/dashboard view. Unbounded, likely one of the more expensive queries in the whole command surface as case count grows.

### apps/desktop/src-tauri/src/task_template/mod.rs
- `create_task_template` (line 11): insert + loop inserting template items. Bounded (a handful of items per template) — low urgency.
- `update_task_template` (line 21): 2 statements + delete-all/reinsert loop for items. Same bounded/low-urgency profile.

## UNCLEAR

None. Every command was traced to its actual SQL/FS/subprocess operations, either directly or by reading the `store::`/internal helper it delegates to.

## TRIVIAL (confirmed, left alone)

- `apps/desktop/src-tauri/src/auth/mod.rs`: `get_session` (106), `save_session` (164), `clear_session` (201) — single-row `auth_session` table.
- `apps/desktop/src-tauri/src/calendar/mod.rs`: `disconnect_google_calendar` (50), `get_google_calendar_status` (57) — single-row `google_calendar_accounts` table.
- `apps/desktop/src-tauri/src/case/annotations.rs`: `get_case_annotations` (14), `delete_case_annotations` (60) — single row by `case_id`.
- `apps/desktop/src-tauri/src/case/mod.rs`: `add_case` (110, 2 bounded statements for one new case), `delete_case` (373), `update_case_status` (383), `verify_folder_in_use` (501), `get_document_annotations` (526), `set_document_annotations` (550), `delete_document_annotations` (572), `get_case_fields` (640) — all single-statement or bounded-to-one-entity.
- `apps/desktop/src-tauri/src/case_template/mod.rs`: `delete_case_template` (34) — single delete.
- `apps/desktop/src-tauri/src/clipboard.rs`: `read_clipboard` (2), `write_clipboard` (9) — OS clipboard API, not DB/FS.
- `apps/desktop/src-tauri/src/contact/mod.rs`: `add_contact_to_case` (190), `remove_contact_from_case` (202) — single statement each.
- `apps/desktop/src-tauri/src/doc_template/mod.rs`: `list_templates` (511) — single query, no per-row extra query.
- `apps/desktop/src-tauri/src/documents/versioning.rs`: `start_case_watcher` (340, spawns an async task, does no blocking work itself), `stop_case_watcher` (363, signals a channel).
- `apps/desktop/src-tauri/src/email/emails_settings.rs`: `get_email_settings` (8), `save_email_settings` (33) — single-row settings table.
- `apps/desktop/src-tauri/src/indexer/mod.rs`: `stop_indexing` (47, atomic flag only), `get_active_indexing_sessions` (52), `delete_indexing_session` (60) — bounded, few active sessions.
- `apps/desktop/src-tauri/src/llm/llm_settings.rs`: `get_ai_settings` (50), `save_ai_settings` (79) — single-row settings table.
- `apps/desktop/src-tauri/src/notifications/mod.rs`: `list_notifications` (38), `update_notification_status` (44), `snooze_notification` (50), `get_notification_settings` (56), `update_notification_settings` (62) — all single delegated queries/statements.
- `apps/desktop/src-tauri/src/power.rs`: `prevent_sleep` (141), `allow_sleep` (146) — OS power API, no I/O.
- `apps/desktop/src-tauri/src/store/mod.rs`: `get_db_path` (518) — pure in-memory path formatting, no I/O at all.
- `apps/desktop/src-tauri/src/tags/mod.rs`: `add_tag` (216), `update_tag` (230), `remove_tag` (242), `list_tags` (253) — all bounded to one tag or one scope entity.
- `apps/desktop/src-tauri/src/task/mod.rs`: `list_tasks_for_case` (5), `create_task` (11), `update_task` (33), `update_task_status` (57), `delete_task` (63) — bounded to one case/task.
- `apps/desktop/src-tauri/src/task_template/mod.rs`: `list_task_templates` (5), `delete_task_template` (32) — single query / single delete.

## Cross-cutting notes

**The `open_db()` overhead is orthogonal and out of scope for this audit.** Every single command above — TRIVIAL or FIX — opens a fresh connection via `store::open_db()`, which (per the ASC-189 performance investigation, `docs/performance-review/asc-189-desktop-performance-investigation.md`) re-runs the *entire* DDL/schema-migration script on every call. That's a separate, already-tracked root cause (Phase 1 of that doc: persistent connection/pool + one-time schema init). This audit's TRIVIAL/FIX split is about the command's *own* logic on top of that baseline, not the connection overhead itself — fixing that separately would reduce the floor cost of literally all 124 commands, FIX and TRIVIAL alike.

**Two duplicate "load all cases" implementations exist**: `case::list_cases` (case/mod.rs:64) and `case::lookup::load_active_cases` (case/lookup.rs:53) run nearly identical queries (same JOIN, same tag-bulk-attach pattern) independently. Worth deduplicating in the same pass as fixing both — one `run_blocking`-wrapped helper could serve `list_cases`, `resolve_cases_for_paths`, and `search_cases`.

**Bounded vs. unbounded matters more than statement count for prioritizing.** Several FIX items are small loops bounded by naturally tiny collections (task-template items, case-template doc links, tasks-per-case reorder) — mechanically identical bug, but low real-world impact. The commands worth fixing *first* are the ones scanning unbounded, grows-over-time data: `list_cases`/`resolve_cases_for_paths`/`search_cases` (all cases in the firm), `list_all_tasks` (all tasks across all cases), `list_tag_values`/`list_all_tag_names` (whole `tags` table), `list_case_emails`/`list_case_attachments` (a case's full email history), plus anything doing real file I/O or CPU work regardless of loop bound: `list_case_files`, `remove_file_from_case`, `open_path`, the three `doc_template` extraction commands, and everything in `documents/versioning.rs`.

**`doc_template::context::get_template_field_context` and `doc_template::mod::sync_template_fields`/`sync_all_templates_fields` call the exact same `extractor::extract()` this PR already wrapped in `run_blocking` inside the indexer.** These three are the closest thing to a "free" follow-up — same helper function, same call pattern, no new abstraction needed, just apply Task 3's exact pattern at three more call sites.

**Special-care flags (beyond the mechanical convert-to-async + wrap-in-`run_blocking` pattern):**
- `case::mod::add_file_to_case` already calls `crate::indexer::index_case_file_in_background(&app, ...)` as its last step — need to confirm that helper is genuinely fire-and-forget (doesn't need the caller to await it) before restructuring.
- `documents::versioning::start_case_watcher`/`stop_case_watcher` use a `Mutex`-guarded `OnceLock<Mutex<Option<oneshot::Sender<()>>>>` (`ACTIVE_WATCHER_TX`) — any refactor here needs to keep the lock scope minimal and confirm it isn't held across a `run_blocking` boundary (not currently an issue since these two are TRIVIAL and untouched, but adjacent code in this file will need care if the FIX items in this module are tackled).
- `doc_template::mod::open_path`'s WSL subprocess-spawn path is platform-gated (`#[cfg(target_os = "linux")]`) — a `run_blocking` wrap here doesn't change that gating, but whoever fixes it should test on both a WSL and non-WSL Linux target if possible, since the two code paths currently behave very differently.
- Every "N+1" FIX item (`list_meetings_for_range`/`_for_case`, `list_case_templates`) could arguably be fixed two ways: wrap the whole N+1 call in `run_blocking` as-is (mechanical, matches this PR's pattern exactly), or fix the underlying query to eliminate the N+1 first (better, but a different kind of change, more risk, out of scope for a mechanical threading-placement pass). Recommend treating "just wrap it" as the default for this follow-up and filing the N+1 elimination as its own separate cleanup if wanted.
