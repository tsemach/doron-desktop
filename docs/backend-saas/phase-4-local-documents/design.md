# Phase 4: Local document access — design

**Linear issue:** [ASC-184](https://linear.app/amicusx/issue/ASC-184) — sub-issue of
[ASC-179](https://linear.app/amicusx/issue/ASC-179/add-fully-backend-support-saas)
**Status:** Design — not yet implemented.
**Date:** 2026-08-22

Covers **Phase 4 only**, per
[`docs/backend-saas/masterplan/plan.md`](../masterplan/plan.md) (PR-4,
stacked on PR-3). Implements Core Decision 2: browser reads a user-granted
local folder live via the File System Access API, symmetric with desktop's
local-disk model, no cloud-provider integration, no server-side copy of
raw file bytes.

## Goals

- Let a user connect a case to a local folder and discover/register its
  files, without ever sending file content to the server.
- Extend Phase 3's case-detail tab set with the 4th tab ("documents"),
  deferred there explicitly for this phase.
- Give Chromium-only browsers a real feature; give everyone else a clear,
  non-broken message rather than a silently missing feature.

## Non-goals

- Phase 5's extraction/embedding pipeline — this phase only discovers and
  registers files, it doesn't read their content for indexing.
- Any drag-and-drop upload fallback for unsupported browsers — a possible
  future addition, not decided here.
- Automatic ongoing sync (detecting renames/deletions in the background) —
  this phase is a discovery+link flow triggered by the user, not a
  desktop-style background poller. Reconciliation on revisit is
  implementation-PR detail.
- Actual code — decision doc only, matching the rest of this stack.

## Correction to Phase 1's schema (carried, already fixed there)

The File System Access API never exposes an absolute filesystem path —
`FileSystemHandle` (the base for `FileSystemFileHandle`/
`FileSystemDirectoryHandle`) has only a `.name` property, by spec,
deliberately, so a web page can't learn a user's local directory structure.
Phase 1's `documents.filePath` column (as originally drafted) assumed a
storable absolute path that doesn't exist to get. Already corrected in
Phase 1's design/PR to `documents.relativePath` — this phase is what makes
that column's actual meaning concrete.

## Decision: where the folder handle lives

**The `FileSystemDirectoryHandle` itself is persisted client-side only, in
IndexedDB, keyed by `caseId` — never sent to or stored on the server.**
This isn't just a workaround for the path-exposure limitation above, it's
the correct architecture for Core Decision 2 generally: the server should
never need real filesystem access at all. `FileSystemHandle` objects are
structured-cloneable and IndexedDB-storable natively (a browser platform
guarantee, not a library), so this needs no new dependency.

## Connection & discovery flow

1. From a case's Documents tab, "Connect local folder" calls
   `showDirectoryPicker()`. User grants access to a specific folder (their
   case folder, which may itself live under an OS-mounted cloud-sync
   folder like OneDrive — invisible to this code, exactly as intended).
2. The handle is stored in IndexedDB keyed by `caseId`. On a later visit,
   the stored handle is reused via `queryPermission()`/`requestPermission()`
   — no need to re-run the picker, though the browser may still require a
   user gesture to re-confirm permission per its own security policy (not
   fully silent forever; this is a real browser constraint, not a design
   choice, and the UI should expect an occasional "click to reconnect"
   step rather than assume permanent silent access).
3. Recursive walk (`for await (const entry of dirHandle.values())`)
   discovers files, computing each one's `relativePath` from the root.
4. Metadata only (`fileName`, `relativePath`, `caseId`) is POSTed to a new
   `apps/backend/app/api/v1/documents` route, which inserts into Phase 1's
   `documents` table with `addedByUserId` — following the same
   cookie-authenticated-route convention Phase 3 established
   (`authorizeOrgSession()` → business-logic function → `NextResponse.json`).
5. **Opening a document** is entirely client-side: re-derive the file from
   the persisted handle by walking `relativePath`'s segments
   (`dirHandle.getFileHandle(...)`), then `file.arrayBuffer()`/a blob URL
   for viewing or download. No server round-trip for content, ever.

## Decision: Chromium-only constraint gets a real UX answer

Feature-detect `"showDirectoryPicker" in window` before showing the
Documents tab's connect flow. Safari/Firefox users see an explicit message
("Document access requires Chrome or Edge") rather than a silently broken
button or a missing tab — this is the "concrete UX answer" the master plan
flagged as owed to this phase, not left as a gap.

## Edge cases

- **Permission revoked**: the next connect attempt naturally re-triggers
  the picker; no special-case handling needed beyond normal
  `queryPermission()` failure → show the connect button again.
- **Case deleted**: `documents` rows cascade-delete per Phase 1's `ON
  DELETE CASCADE`. The IndexedDB handle entry for that `caseId` becomes an
  orphan client-side — harmless (never referenced again since the case's
  UI is gone), cleanup is a nice-to-have, not required for correctness.
- **Multiple browsers/devices**: each browser has independent IndexedDB —
  a folder connected in Chrome on one machine isn't visible from Edge on
  another, or from the same case viewed on a phone. This is the accepted
  symmetry with desktop's own local-disk limitation (Core Decision 2), not
  a bug to fix here.
- **File deleted/renamed locally after registration**: the registered
  `documents` row becomes stale (points at a `relativePath` that no longer
  resolves). Detecting and reconciling this is explicitly a Non-goal for
  this phase (no background poller) — "open" simply fails gracefully if
  the path no longer resolves, surfaced as a normal error, not a crash.

## What this unblocks

Phase 5's extraction/indexing pipeline processes the `documents` rows
registered here, reading file content live via the same client-side handle
mechanism (extraction must happen browser-side too, for the same reason
"open" does — the server never gets the bytes).
