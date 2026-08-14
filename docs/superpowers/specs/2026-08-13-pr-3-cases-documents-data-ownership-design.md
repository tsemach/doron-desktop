# Cases/documents data-ownership decision — design

**Linear issue:** [ASC-105](https://linear.app/amicusx/issue/ASC-105/add-user-area-in-the-backend) — "Add user area in the backend"
**Status:** Sub-project 3 of 6 (see [ASC-105 decomposition](#asc-105-decomposition) below)
**Date:** 2026-08-13 (revised 2026-08-15)

## ASC-105 decomposition

1. **Private-area shell & entry point** — PR-1, spec at
   [`2026-08-10-pr-1-private-area-shell-entry-point-design.md`](2026-08-10-pr-1-private-area-shell-entry-point-design.md).
2. **Opening/dashboard page** — PR-2/PR-2.5, depends on #1 only, not on real data.
3. **Cases/documents data-ownership decision** (backend Postgres vs.
   desktop-local vs. hybrid) — this document. The highest-leverage, most
   consequential decision; blocks real (non-mock) workspace features and
   all of sync.
4. **Offline + two-way sync** — cannot be designed until #3 is decided.
5. **Shared UI strategy** (`packages/ui` expansion) — can start early in
   parallel, but concrete data-bound components need #3 resolved.
6. **"Coming soon" gating for unbuilt features** — small, mechanical,
   depends on #1.

This document covers **#3 only**: a decision and its rationale, not
implementation. #4 and #5 each get their own spec once this lands.

## Background

The ASC-105 issue itself asks this as an open question, verbatim: *"how to
handle documents - where is the source of truth? are they in cloud or
locally? how to handle two way syncing."* Two pieces of groundwork already
exist and directly shape the answer:

- **Desktop data model is 100% local, with zero tenancy.** Every
  case/document table (`cases`, `case_fields`, `case_annotations`,
  `document_annotations`, `tags`, `case_emails`, `pending_email_alerts`,
  `documents`, `document_chunks`, `doc_templates`, `case_templates`,
  `document_versions`, plus the matcher's `case_identifiers`/`case_text_fts`)
  lives in a per-install SQLite database
  (`apps/desktop/src-tauri/src/store/mod.rs`,
  `apps/desktop/src-tauri/src/store/matcher_schema.rs`). **None of them has
  a `user_id`, `owner_id`, or `firm_id` column.** Timestamp coverage is
  inconsistent — several tables (`case_fields`, `document_chunks`,
  `case_template_docs`) have no timestamp column at all — and no table has
  a version/revision counter. A repo-wide search for
  `dirty_flag|remote_id|conflict_resolution|is_dirty|sync_status` returns
  zero hits: no sync-prep concept exists anywhere in the codebase today.
- **Backend identity/org layer is real, and case/document data isn't.**
  ASC-142 (merged) added `firms`, `users` (`role`: admin/manager/user/flat,
  `firmId`), `teams`, `teamMembers`, `invitations` to
  `packages/backend-orm/src/schema.ts`. There is no table anywhere in the
  backend resembling cases, documents, matters, or client records. ASC-142's
  own design doc (`docs/identity-and-roles/design.md`) explicitly scoped
  "cross-user visibility into case/document content" as a non-goal,
  deferring it to exactly this decision.
- **The stated architectural constraint.** `PRD.md` §6 calls "local-first /
  privacy" *"a stated architectural value, not just a cost optimization —
  client confidentiality is presumably a real constraint for the target
  user,"* and adds: *"Any auth/subscription bridge to the backend must not
  silently start uploading case content."* The same section states offline
  tolerance as a hard requirement: the app works fully offline today, and a
  lawyer "standing in a courthouse basement with dead WiFi is a real
  scenario for this product." `PRD.md` §8.3 separately flags multi-user/firm
  sharing of case content as an unresolved open question.
- **The tension this decision has to resolve.** ASC-105's own stated goal
  is to shift "the usual case is a firm with several users with several
  roles... this change the whole design into more and more SaaS
  application" (ASC-105 issue body) — most business logic moving into
  `apps/backend`. The dashboard already built for that goal (PR-2/PR-2.5)
  renders `Important Tasks`, `Emails Arrived`, `Billing & Finance`, and
  `Open Cases` panels in `apps/backend` today — 100% mock data, because
  there is nothing real in Postgres to back it.

## Goals

- Give a definitive answer to "where does case/document data live" and,
  specifically, whether/how it ever reaches the backend.
- Keep the desktop as the unconditional, permanent source of truth — never
  put a lawyer's only copy of their case files at risk to a sync bug.
- Define a concrete, efficient algorithm for the one piece of case/document
  data that *does* leave the desktop under this decision: an opt-in cloud
  backup, detailed enough (schemas, parameters, command signatures) for a
  future implementation PR to build directly against.

## Non-goals (explicitly deferred)

- Any schema migration, Postgres table creation, Drizzle changes, or Rust
  code — that belongs to whichever PR implements this design.
- Restore / download-back of a backed-up file — explicitly out of scope for
  ASC-105 entirely, not just this PR. Cloud backup is one-directional.
- Any two-way sync or conflict resolution of case/document content.
- Files over the size cap defined below (v1) — named as a fast-follow.
- Multi-tenant/firm-wide visibility into backed-up files.

## Decision

**Desktop remains the sole source of truth, unconditionally — including
full document content, not just metadata.** On top of that, an *opt-in*
"Cloud Backup" feature (off by default, a Settings toggle) uploads files to
backend-managed cloud storage in the background, one-directionally (desktop
→ cloud). This directly satisfies `PRD.md`'s "must not *silently* start
uploading case content": it's an explicit, visible, user-controlled toggle,
not automatic behavior. No restore/download-back capability exists — that's
a specific, separate operation explicitly out of scope for ASC-105.

The engineering problem this decision has to solve is the one posed
directly: once a user enables backup, how to do it efficiently — (1)
identify which files need saving, (2) decide when and at what rate to
upload them, without interfering with the user's foreground work.

### Prior art already in this codebase (reused, not reinvented)

- **`documents/versioning.rs`'s `start_case_watcher`/`poll_case_folder`** —
  a `tokio::time::interval(3s)` polling loop (not the `notify` crate, which
  isn't a dependency anywhere in this codebase) that tracks `FileState {
  mtime, size, is_locked }` per file in memory, recognizes Office lock
  files (`~$*`) to know a file is mid-edit, and only acts once a file
  settles. It's UI-lifecycle-bound to the single currently-open case
  (started/stopped from `CaseManagementOpenCasesDetails.tsx` via a global
  singleton slot) — not usable as-is for an always-on, all-cases service,
  but its *logic* (lock-file awareness, settle-before-acting) is exactly
  the right prior art to extend, in preference to adding a new dependency.
- **`poll_emails_background`** (`email/emails_ops.rs`) — the established
  recurring-background-task shape: `tokio::time::interval` +
  `MissedTickBehavior::Delay`, spawned once from `lib.rs`'s `.setup()`.
  `MissedTickBehavior::Delay` is deliberate — it avoids a "catch-up burst"
  after the app was asleep/offline, which would risk provider throttling;
  the identical concern applies to a backup upload endpoint.
- **`emails_settings.rs`/`llm_settings.rs`** — the established settings
  pattern: a single-row SQLite table + `get_X_settings`/`save_X_settings`
  Tauri commands + a non-command `get_X_settings_internal` for background
  code to read the toggle without going through the command layer.
- **`apps/office/app/api/templates/upload/route.ts`** — the reusable
  backend upload shape: `put(blobPath, file, { access: "private", token })`
  on Vercel Blob (already provisioned: `@vercel/blob`,
  `BLOB_READ_WRITE_TOKEN` already in `apps/backend/.env`) → Drizzle insert
  with the returned blob URL.
- **`authorizeDesktopToken()`** (`apps/backend/lib/desktopAuth.ts`) — the
  existing desktop→backend auth convention: an opaque token read from the
  request **body** (not an `Authorization` header), used by existing routes
  under `apps/backend/app/api/v1/org/desktop/*`.

### Change detection — no new dependency, two mechanisms at two different frequencies

A full recursive `walkdir` over *every* case folder is O(total files across
every case) — cheap occasionally, wasteful as a tight everyday loop once a
user's case corpus grows into the thousands of mostly-untouched files. So
this uses two complementary mechanisms instead of one fixed-interval full
walk:

1. **Primary — extend the existing per-open-case watcher.** The 3-second
   poll already described above already fires exactly when a file in the
   *currently open* case has just settled. Backup queuing hooks into that
   same settle event. This is the everyday path: fast (3s), and cheap
   because it's scoped to one case (a handful of files), not the whole
   corpus.
2. **Safety net — infrequent full `walkdir` reconciliation**, using the
   same traversal shape `index_folder` already uses, but run **hourly**
   (not every few minutes) plus once at app startup and once immediately
   when the user first enables the feature. This exists only to catch what
   #1 structurally can't: files changed in a case that wasn't open in the
   app (edited via Finder/Explorer, dropped in by another tool), and cases
   that haven't been opened recently at all. Because it's rare, the O(all
   files) cost is acceptable; because #1 handles the common case,
   correctness doesn't depend on the hourly cadence being tight.

Both mechanisms feed the same two-tier check before queuing a file: (a)
cheap tier — compare current `(mtime, size)` against the last stored
values for that path; unchanged → skip, no I/O beyond one `stat`; (b) hash
tier — only if (a) changed, compute a SHA-256 content hash and compare
against the last uploaded hash, filtering out touch-without-content-change
false positives. SHA-256 is a deliberate choice, not a copy of
`document_versions.md5_hash` (which uses MD5 for a different, lower-stakes,
purely-local dedupe purpose) — this hash crosses a network/trust boundary,
where MD5's weaker collision resistance is a worse fit.

**Settle rule** (avoids uploading a file mid-write): skip any file matching
the Office lock-file pattern (`~$*`) or with a live lock file. For the
watcher path (#1), this is already how `versioning.rs` detects "done
editing." For the reconciliation path (#2), require `(mtime, size)` to be
stable across two consecutive hourly scans before queuing — a file still
mid-edit across two scans an hour apart is an edge case, not the common
path (#1 already handles "just finished editing" at 3-second granularity).

### Scheduling — one merged table, single-flight interval drain

One SQLite table (`document_backups`) is both the per-file "last known
state" and the upload "queue" (via a status column) — a single table, not
two tracking overlapping state, to avoid drift risk if a case is
renamed/deleted mid-flight. One `tokio::time::interval` task, spawned once
alongside the other background pollers in `lib.rs`'s `.setup()`:

- Hourly (+ startup + on-enable): rerun the full `walkdir` reconciliation
  across all cases, enqueuing settled, changed files as `status = 'pending'`.
- Every 15-second drain tick: attempt to upload **one** `pending` row
  (oldest first), single-concurrency — the same "one thing at a time"
  spirit as the email poller, so it never competes hard with foreground
  disk/network I/O.
- `MissedTickBehavior::Delay`, for the same anti-thundering-herd reason as
  the email poller — a laptop waking from sleep with a large backlog
  shouldn't burst-upload.
- Gated on `backup_settings.enabled` via `get_backup_settings_internal`
  (checked every tick, no-ops when off) — the loop always runs; it just
  does nothing when the feature is off, rather than being dynamically
  spawned/killed on toggle.

**Parameter defaults.** Two different clocks are involved, doing two
different jobs — "how often do we look for changed files" (detection) vs.
"how often do we upload a file that's already waiting" (draining the
queue):

| Parameter | Value | What it actually controls |
|---|---|---|
| Active-case watch interval | 3 seconds (existing, reused from `versioning.rs`) | How fast the *currently open* case's files are checked for a settled change — the everyday detection path. Already cheap since it's scoped to one case. |
| Full reconciliation scan interval | 1 hour, + once at app startup, + once when the feature is first enabled | The rare, all-cases safety-net walk — catches changes the active-case watcher structurally can't see. Infrequent on purpose, since it's O(all files). |
| Reconciliation settle requirement | 2 consecutive hourly scans stable | Only relevant to the safety-net path — the active-case watcher already handles "just finished editing" at 3-second granularity. |
| Upload-queue drain tick | 15 seconds | Independent of both scan intervals above — "is there a file already queued and ready to upload?" Mirrors `POLL_INTERVAL` in `emails_ops.rs` exactly. Fast, because once a file *is* ready we don't want it to sit around — but concurrency is still capped at 1, so this never becomes a burst. |
| Upload concurrency | 1 | Only one file uploads at a time, so the fast 15s check never turns into simultaneous uploads competing with the user's foreground network/CPU use. |
| Max file size | 4 MB | Vercel's server functions hard-reject request bodies over 4.5 MB — this is a real ceiling, not a tunable preference. Oversized files get `status = 'skipped_too_large'`, surfaced in Settings rather than silently dropped; going beyond this cap is a named fast-follow (see Open risks below), not solved here. |
| Retry backoff | exponential via `attempt_count` (wait `attempt_count * 15s` since `last_attempted_at` before retrying), cap ~10 attempts, then leave `status = 'failed'` (surfaced, not retried forever) | Stops one persistently-failing file (e.g. a case folder on a disconnected network drive) from monopolizing the single upload slot on every drain tick. |

### Upload path

New route `apps/backend/app/api/v1/org/desktop/case-documents/upload/route.ts`
— multipart body carrying a `token` field (matching `authorizeDesktopToken`'s
existing body-token convention) → authorize → reject files over the 4 MB
cap with a distinguishable error the Rust side maps to `skipped_too_large`
→ `put(blobPath, file, { access: "private" })` on Vercel Blob → upsert into
a new Postgres table.

### Schema (illustrative — a future implementation PR owns the literal
migration; this is the shape to build against)

Desktop SQLite:
```sql
CREATE TABLE IF NOT EXISTS document_backups (
    file_path         TEXT PRIMARY KEY,
    case_id           INTEGER NOT NULL,
    content_hash      TEXT,              -- sha256 hex; NULL until first hash computed
    last_seen_mtime   TEXT,              -- ISO8601, for the cheap tier-1 check
    last_seen_size    INTEGER,
    status            TEXT NOT NULL DEFAULT 'pending', -- pending|uploading|uploaded|failed|skipped_too_large|skipped_missing
    queued_at         TEXT,
    uploaded_at       TEXT,
    attempt_count     INTEGER NOT NULL DEFAULT 0,
    last_attempted_at TEXT,
    last_error        TEXT,
    FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_document_backups_status ON document_backups(status);

CREATE TABLE IF NOT EXISTS backup_settings (
    enabled INTEGER NOT NULL DEFAULT 0
);
```

Backend Postgres (`packages/backend-orm/src/schema.ts`), one row per
`(userId, filePath)` — a latest-snapshot table, not a version log (local
`document_versions` already owns version history on the desktop; restore
is out of scope, so the backend doesn't need one either):
```ts
export const caseDocumentBackups = pgTable("case_document_backups", (t) => ({
  id: t.uuid("id").primaryKey().defaultRandom(),
  userId: t.text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  localCaseId: t.integer("local_case_id").notNull(), // desktop's own cases.id, opaque here
  filePath: t.text("file_path").notNull(),
  fileName: t.text("file_name").notNull(),
  contentHash: t.text("content_hash").notNull(),
  fileSize: t.integer("file_size").notNull(),
  url: t.text("url").notNull(),
  createdAt: t.timestamp("created_at").defaultNow().notNull(),
  updatedAt: t.timestamp("updated_at").defaultNow().notNull(),
}), (table) => ({
  uniqueUserFile: unique().on(table.userId, table.filePath),
}));
```

### Settings

New `SettingCloudBackup.tsx`, wired into `Settings.tsx`'s existing
`handleSave`, following `SettingEmailIntegration.tsx`'s exact shape. New
Tauri commands `get_backup_settings`/`save_backup_settings` +
`get_backup_settings_internal`, mechanically copied from
`emails_settings.rs`. `BackupConfig { enabled: bool }` only — resist adding
user-facing debounce/interval overrides in v1; those are the algorithm's
job, not user-facing settings (matching how `POLL_INTERVAL` is a hardcoded
`pub const` today, not configurable).

## Edge cases

- **Huge backlog on first enable** — the on-enable reconciliation scan
  could find thousands of pre-existing files across every case. The 15s,
  single-concurrency drain tick naturally throttles this to a trickle; the
  scan itself must run inside the same spawned background task (not
  block the Settings toggle's calling thread), streaming enqueues rather
  than inserting everything synchronously.
- **Laptop sleep/wake** — no OS file-watch handles exist to go stale across
  suspend (there's no `notify` watcher); the next scan/drain tick simply
  re-derives state fresh. `MissedTickBehavior::Delay` prevents a burst of
  catch-up ticks on wake.
- **Case folder deleted or file removed mid-upload** — the drain worker
  treats "path no longer exists" as a terminal, non-retriable state
  (`status = 'skipped_missing'`), not an error to retry forever.
- **Case folder renamed** — not resolved in-band; the next reconciliation
  scan handles it naturally (old paths vanish, new paths under the new
  folder get freshly enqueued), since scans rerun periodically, not just
  once.
- **File never gets backed up** (feature never enabled, or a file
  permanently exceeds the size cap) — this is expected, visible behavior
  (`skipped_too_large`, or `backup_settings.enabled = false`), not an
  error state.

## Open risks / follow-ups

- **Files over 4 MB are not backed up in v1.** The correct fix is
  implementing Vercel Blob's client-upload token flow (`@vercel/blob/client`'s
  `handleUpload` protocol) from Rust — a short-lived signed token lets
  `reqwest` PUT file bytes directly to Blob storage, bypassing the Next.js
  function's body-size limit entirely. No precedent for this exists yet in
  this codebase; it's real, additional work, named here as a deliberate v1
  scope cut rather than an oversight.
- **Retry/backoff tuning** should be revisited once real usage data exists
  (how often does upload actually fail, and why).
- **No telemetry on backlog size** is designed in yet — worth adding so a
  user (or support) can see "N files pending, M failed" rather than the
  feature being an opaque background process.

## What this unblocks

- A future implementation PR can build directly against the schemas,
  parameters, and command signatures above.
- **#5 (shared UI strategy)** gains a concrete example of what a
  desktop-owned, backend-mirrored data shape looks like (distinct from the
  identity/org data ASC-142 already centralized).
- Confirms **#4 (offline + two-way sync)**, as originally scoped, is not
  needed for case/document *content* — the desktop was never going to be an
  offline-capable client of a cloud source of truth for that content. If a
  future need for cross-device *access* to case content emerges, it would
  be a new decision, not a continuation of #4.
